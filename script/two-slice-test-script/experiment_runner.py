import subprocess
import time
import os
import signal
import json
import re
import sys
import csv
import urllib.request
from datetime import datetime

# Configuration
BATCH_COUNT = 10
FAST_PER_BATCH = 9
SLOW_PER_BATCH = 1
FAST_START_IMSI = 1
SLOW_START_IMSI = 91
MAX_CONCURRENT = 10

# Timeouts (seconds)
# Connection time for 90 UEs is approx 30s.
# Fast Idle = 30s. Total needs > 60s.
FAST_TIMEOUT = 180  # Increased to allow SMF idleTimeout (e.g. 120s) to trigger
SLOW_TIMEOUT = 300  # Increased proportionally 

# Paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "../../"))
LOG_DIR = os.path.join(SCRIPT_DIR, "experiment_logs")
STATUS_FILE = os.path.join(SCRIPT_DIR, "experiment_status.json")
TIMELINE_FILE = os.path.join(SCRIPT_DIR, "timeline.csv")

# Templates
UE1_CONFIG = os.path.join(ROOT_DIR, "config/ue1.yaml")
UE2_CONFIG = os.path.join(ROOT_DIR, "config/ue2.yaml")

class Job:
    def __init__(self, job_type, count, start_imsi, batch_id):
        self.job_type = job_type # "fast" or "slow"
        self.count = count
        self.start_imsi = start_imsi
        self.batch_id = batch_id
        self.pid = None
        self.start_time = None
        self.log_file = None
        self.status = "pending" # pending, running, completed, timeout

    def __repr__(self):
        return f"Job(Batch={self.batch_id}, Type={self.job_type}, Count={self.count}, IMSI={self.start_imsi})"

def load_template(path):
    with open(path, 'r') as f:
        return f.read()

def create_config(template_path, msin, output_path):
    with open(template_path, 'r') as f:
        content = f.read()
    
    # Replace MSIN
    # Format: msin: "0000000001"
    msin_str = f"{msin:010d}"
    content = re.sub(r'msin: "\d+"', f'msin: "{msin_str}"', content)
    
    with open(output_path, 'w') as f:
        f.write(content)

def get_active_ue_count(active_jobs):
    return sum(job.count for job in active_jobs)

def get_active_supis_from_smf():
    try:
        url = "http://127.0.0.2:8000/debug/sessions"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=1) as response:
            data = json.loads(response.read().decode())
            sessions = data.get("sessions")
            if not sessions:
                return set()
            return set(s.get("supi") for s in sessions if s.get("supi"))
    except Exception:
        return set()

def update_status(start_time, active_jobs, completed_jobs, events):
    status = {
        "start_time": start_time,
        "current_time": time.time(),
        "elapsed": time.time() - start_time,
        "active_ue_count": get_active_ue_count(active_jobs),
        "completed_fast": sum(j.count for j in completed_jobs if j.job_type == "fast"),
        "completed_slow": sum(j.count for j in completed_jobs if j.job_type == "slow"),
        "active_jobs": [str(j) for j in active_jobs],
        "events": events[-10:] # Last 10 events
    }
    with open(STATUS_FILE, 'w') as f:
        json.dump(status, f, indent=2)

def log_event(events, event_type, message, active_count):
    timestamp = datetime.now().strftime("%H:%M:%S")
    event = f"[{timestamp}] {event_type}: {message} (Active: {active_count})"
    print(event)
    events.append(event)
    
    # Append to timeline.csv
    # Format: timestamp, event_type, active_ue_count, message
    # Use csv module to handle special characters
    with open(TIMELINE_FILE, 'a', newline='') as f:
        writer = csv.writer(f)
        writer.writerow([time.time(), event_type, active_count, message])

def main():
    # Initialize
    if not os.path.exists(LOG_DIR):
        os.makedirs(LOG_DIR)
    
    # Clear timeline
    with open(TIMELINE_FILE, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(["timestamp", "event_type", "active_count", "message"])

    # Generate Queue
    queue = []
    fast_imsi = FAST_START_IMSI
    slow_imsi = SLOW_START_IMSI
    
    for i in range(1, BATCH_COUNT + 1):
        # Interleave: Fast then Slow
        queue.append(Job("fast", FAST_PER_BATCH, fast_imsi, i))
        fast_imsi += FAST_PER_BATCH
        
        queue.append(Job("slow", SLOW_PER_BATCH, slow_imsi, i))
        slow_imsi += SLOW_PER_BATCH

    active_jobs = []
    completed_jobs = []
    events = []
    start_time = time.time()
    
    log_event(events, "START", "Experiment Started", 0)

    try:
        while queue or active_jobs:
            current_time = time.time()
            
            # Get active sessions from SMF for cross-reference
            active_smf_supis = get_active_supis_from_smf()

            # 1. Check Active Jobs
            jobs_to_remove = []
            for job in active_jobs:
                # Check timeout
                timeout = FAST_TIMEOUT if job.job_type == "fast" else SLOW_TIMEOUT
                if current_time - job.start_time > timeout:
                    log_event(events, "TIMEOUT", f"Job {job} timed out", get_active_ue_count(active_jobs))
                    job.status = "timeout"
                    jobs_to_remove.append(job)
                    continue
                
                # Check SMF status (Reactive Release)
                # Construct expected SUPIs for this job
                # Format: imsi-208930000000001 (15 digits)
                # job.start_imsi is e.g. 1. We need to pad to 10 digits for MSIN.
                # MCC=208, MNC=93.
                job_supis = set()
                for i in range(job.count):
                    msin = job.start_imsi + i
                    supi = f"imsi-20893{msin:010d}"
                    job_supis.add(supi)
                
                # Check if ANY of the job's SUPIs are still active in SMF
                # If intersection is empty, it means ALL sessions for this job are gone.
                remaining_sessions = job_supis.intersection(active_smf_supis)
                if not remaining_sessions and job.pid:
                     # Double check: ensure we gave it at least some time to start (e.g. 5 seconds)
                     if current_time - job.start_time > 20:
                        log_event(events, "COMPLETED", f"Job {job} completed (SMF confirmed release)", get_active_ue_count(active_jobs))
                        job.status = "completed"
                        jobs_to_remove.append(job)
                        continue

                # Check logs for release
                if job.pid:
                    # Check if process is still running
                    try:
                        os.kill(job.pid, 0)
                    except OSError:
                        log_event(events, "DIED", f"Job {job} process died unexpectedly", get_active_ue_count(active_jobs))
                        job.status = "died"
                        jobs_to_remove.append(job)
                        continue

                    # Check logs
                    try:
                        # Count "Release" occurrences
                        cmd = f"grep -c 'PDU Session Release' {job.log_file}"
                        result = subprocess.run(cmd, shell=True, stdout=subprocess.PIPE)
                        release_count = int(result.stdout.strip() or 0)
                        
                        if release_count >= job.count:
                            log_event(events, "COMPLETED", f"Job {job} completed (All released)", get_active_ue_count(active_jobs))
                            job.status = "completed"
                            jobs_to_remove.append(job)
                    except Exception as e:
                        pass

            # Cleanup removed jobs
            for job in jobs_to_remove:
                if job.pid:
                    try:
                        os.kill(job.pid, signal.SIGTERM) # Kill the process
                    except:
                        pass
                active_jobs.remove(job)
                completed_jobs.append(job)

            # 2. Start New Jobs
            if queue:
                current_count = get_active_ue_count(active_jobs)
                available_slots = MAX_CONCURRENT - current_count
                
                if available_slots > 0:
                    next_job = queue[0]
                    
                    if next_job.count <= available_slots:
                        # Run entire job
                        job = queue.pop(0)
                    else:
                        # Split job
                        # Create partial job to run
                        job = Job(next_job.job_type, available_slots, next_job.start_imsi, next_job.batch_id)
                        
                        # Update remaining job in queue
                        next_job.count -= available_slots
                        next_job.start_imsi += available_slots
                        # Keep next_job in queue[0]
                    
                    # Prepare Config (Use IMSI in filename to avoid collisions)
                    config_file = os.path.join(LOG_DIR, f"ue_{job.job_type}_b{job.batch_id}_{job.start_imsi}.yaml")
                    template = UE1_CONFIG if job.job_type == "fast" else UE2_CONFIG
                    create_config(template, job.start_imsi, config_file)
                    
                    # Prepare Log
                    job.log_file = os.path.join(LOG_DIR, f"ue_{job.job_type}_b{job.batch_id}_{job.start_imsi}.log")
                    
                    # Launch
                    cmd = [
                        "sudo", "ip", "netns", "exec", "free-ue-ns",
                        os.path.join(ROOT_DIR, "build/free-ran-ue"), "ue",
                        "-c", config_file,
                        "-n", str(job.count)
                    ]
                    
                    with open(job.log_file, 'w') as log_f:
                        process = subprocess.Popen(cmd, stdout=log_f, stderr=subprocess.STDOUT)
                    
                    job.pid = process.pid
                    job.start_time = time.time()
                    job.status = "running"
                    active_jobs.append(job)
                    
                    log_event(events, "LAUNCH", f"Starting Job {job}", get_active_ue_count(active_jobs))

            update_status(start_time, active_jobs, completed_jobs, events)
            time.sleep(1)

    except KeyboardInterrupt:
        log_event(events, "STOP", "Experiment interrupted by user", get_active_ue_count(active_jobs))
    finally:
        # Cleanup
        log_event(events, "END", "Cleaning up...", 0)
        for job in active_jobs:
            if job.pid:
                try:
                    os.kill(job.pid, signal.SIGTERM)
                except:
                    pass
        update_status(start_time, active_jobs, completed_jobs, events)

if __name__ == "__main__":
    main()

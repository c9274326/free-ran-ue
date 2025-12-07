import matplotlib.pyplot as plt
import pandas as pd
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TIMELINE_FILE = os.path.join(SCRIPT_DIR, "timeline.csv")
REPORT_FILE = os.path.join(SCRIPT_DIR, "experiment_report.txt")
GRAPH_FILE = os.path.join(SCRIPT_DIR, "active_ue_graph.png")

def main():
    if not os.path.exists(TIMELINE_FILE):
        print(f"Error: {TIMELINE_FILE} not found.")
        return

    try:
        df = pd.read_csv(TIMELINE_FILE)
    except Exception as e:
        print(f"Error reading CSV: {e}")
        return

    if df.empty:
        print("No data in timeline.")
        return

    # Convert timestamp to relative time
    start_time = df['timestamp'].iloc[0]
    df['relative_time'] = df['timestamp'] - start_time

    # Plot Active UEs
    plt.figure(figsize=(12, 6))
    plt.step(df['relative_time'], df['active_count'], where='post', label='Active UEs')
    
    # Add markers for events
    launch_events = df[df['event_type'] == 'LAUNCH']
    completed_events = df[df['event_type'] == 'COMPLETED']
    timeout_events = df[df['event_type'] == 'TIMEOUT']
    
    plt.scatter(launch_events['relative_time'], launch_events['active_count'], color='green', marker='^', label='Launch', zorder=5)
    plt.scatter(completed_events['relative_time'], completed_events['active_count'], color='blue', marker='v', label='Completed', zorder=5)
    plt.scatter(timeout_events['relative_time'], timeout_events['active_count'], color='red', marker='x', label='Timeout', zorder=5)

    plt.xlabel('Time (s)')
    plt.ylabel('Active UEs')
    plt.title('Active UEs Over Time (Continuous Load)')
    plt.grid(True)
    plt.legend()
    plt.savefig(GRAPH_FILE)
    print(f"Graph saved to {GRAPH_FILE}")

    # Generate Report
    total_duration = df['relative_time'].iloc[-1]
    total_launches = len(launch_events)
    total_completed = len(completed_events)
    total_timeouts = len(timeout_events)
    
    with open(REPORT_FILE, 'w') as f:
        f.write("=== Experiment Report ===\n")
        f.write(f"Total Duration: {total_duration:.2f} s\n")
        f.write(f"Total Launches: {total_launches}\n")
        f.write(f"Total Completed: {total_completed}\n")
        f.write(f"Total Timeouts: {total_timeouts}\n")
        f.write("\n")
        f.write("Events:\n")
        for _, row in df.iterrows():
            f.write(f"{row['relative_time']:.2f}s - {row['event_type']}: {row['message']}\n")
            
    print(f"Report saved to {REPORT_FILE}")

if __name__ == "__main__":
    main()

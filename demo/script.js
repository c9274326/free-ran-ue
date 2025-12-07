// ===== Data & State Management =====
let sessions = [];
let cleanupEvents = [];
let stats = {
    totalSessions: 0,
    cleanedSessions: 0,
    avgIdleTime: 0,
    successRate: 100
};

// SMF API Configuration
// Use local proxy to avoid CORS issues
const SMF_API_BASE = '/api'; // Proxy will forward to http://127.0.0.2:8000
const USE_REAL_DATA = true; // Set to false to use mock data

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', () => {
    initializeArchitectureDiagram();
    initializeMessageFlow();

    if (USE_REAL_DATA) {
        fetchRealData();
    } else {
        generateMockData();
    }

    updateDashboard();
    startAutoRefresh();
});

// ===== Fetch Real Data from SMF =====
async function fetchRealData() {
    try {
        // Fetch sessions
        const sessionsResponse = await fetch(`${SMF_API_BASE}/debug/sessions`);
        if (sessionsResponse.ok) {
            const data = await sessionsResponse.json();
            processRealSessions(data.sessions || []);
        } else {
            console.warn('Failed to fetch sessions, using mock data');
            generateMockData();
        }

        // Fetch stats
        const statsResponse = await fetch(`${SMF_API_BASE}/debug/stats`);
        if (statsResponse.ok) {
            const statsData = await statsResponse.json();
            processRealStats(statsData);
        }
    } catch (error) {
        console.warn('Error fetching real data:', error.message);
        console.info('Falling back to mock data for demo purposes');
        generateMockData();
    }
}

// ===== Process Real Sessions Data =====
function processRealSessions(realSessions) {
    if (!realSessions || realSessions.length === 0) {
        // No real sessions found
        sessions = [];
        stats.totalSessions = 0;
        stats.cleanedSessions = 0;
        stats.avgIdleTime = 0;

        // Add helpful message to timeline
        if (cleanupEvents.length === 0 || cleanupEvents[0].type !== 'no-sessions') {
            cleanupEvents.unshift({
                time: new Date(),
                type: 'no-sessions',
                title: '⚠️ No Active Sessions',
                description: 'Start a UE to see real PDU Session data: make ns-ue',
                icon: '📱'
            });
        }
        return;
    }

    sessions = realSessions.map(session => {
        // Parse idle duration (format: "43s" or "1m30s")
        let idleSeconds = 0;
        if (session.idleDuration) {
            const duration = session.idleDuration;
            const minutesMatch = duration.match(/(\d+)m/);
            const secondsMatch = duration.match(/(\d+)s/);
            if (minutesMatch) idleSeconds += parseInt(minutesMatch[1]) * 60;
            if (secondsMatch) idleSeconds += parseInt(secondsMatch[1]);
        }

        // Determine status
        let status = 'active';
        if (session.state === 'InActive' || session.state === 'InActivePending') {
            status = 'released';
        } else if (session.isIdle || idleSeconds > 30) {
            status = 'idle';
        }

        return {
            id: `PDU-${session.pduSessionId}`,
            supi: session.supi || 'N/A',
            ip: session.ip || 'N/A',
            status: status,
            lastActive: session.lastActiveTime ? new Date(session.lastActiveTime) : new Date(),
            idleTime: idleSeconds,
            slice: {
                sst: session.snssai?.sst || 1,
                sd: session.snssai?.sd || 'N/A'
            },
            dnn: session.dnn || 'N/A',
            state: session.state || 'Unknown',
            remainingTime: session.remainingTime || 'N/A'
        };
    });

    // Update stats based on real sessions
    // totalSessions = all existing sessions (active + idle, excluding released)
    stats.totalSessions = sessions.filter(s => s.status === 'active' || s.status === 'idle').length;
    stats.cleanedSessions = sessions.filter(s => s.status === 'released').length;
    stats.avgIdleTime = sessions.length > 0
        ? Math.floor(sessions.reduce((sum, s) => sum + s.idleTime, 0) / sessions.length)
        : 0;

    // Remove no-sessions message if we have sessions now
    cleanupEvents = cleanupEvents.filter(e => e.type !== 'no-sessions');
}

// ===== Process Real Stats Data =====
function processRealStats(statsData) {
    if (statsData.TotalCleaned !== undefined) {
        stats.cleanedSessions = statsData.TotalCleaned;
    }
    if (statsData.TotalScans !== undefined) {
        // Add to cleanup events
        if (statsData.LastScanTime) {
            const lastScan = new Date(statsData.LastScanTime);
            if (!cleanupEvents.some(e => e.type === 'scan' && Math.abs(e.time - lastScan) < 1000)) {
                cleanupEvents.unshift({
                    time: lastScan,
                    type: 'scan',
                    title: 'Periodic Scan',
                    description: `Scanned sessions, cleaned: ${statsData.LastCleanedCount || 0}`,
                    icon: '🔍'
                });
                // Keep only last 10 events
                if (cleanupEvents.length > 10) {
                    cleanupEvents = cleanupEvents.slice(0, 10);
                }
            }
        }
    }
}

// ===== Architecture Diagram =====
function initializeArchitectureDiagram() {
    const diagram = document.getElementById('architectureDiagram');

    const components = [
        { name: 'UE', icon: '📱', color: '#00d4ff' },
        { name: 'gNB', icon: '📡', color: '#7c3aed' },
        { name: 'AMF', icon: '🔐', color: '#f59e0b' },
        { name: 'SMF', icon: '⚙️', color: '#10b981' },
        { name: 'UPF', icon: '🌐', color: '#ef4444' }
    ];

    diagram.innerHTML = `
        <div style="display: flex; justify-content: space-around; align-items: center; width: 100%; position: relative;">
            ${components.map((comp, idx) => `
                <div class="arch-component fade-in" style="animation-delay: ${idx * 0.1}s;">
                    <div class="arch-icon" style="background: linear-gradient(135deg, ${comp.color}, ${adjustColor(comp.color, -20)});">
                        <span style="font-size: 3rem;">${comp.icon}</span>
                    </div>
                    <div class="arch-name">${comp.name}</div>
                    ${idx < components.length - 1 ? `
                        <div class="arch-arrow" style="animation-delay: ${idx * 0.1 + 0.5}s;">
                            <svg viewBox="0 0 100 20" style="width: 100px; height: 20px;">
                                <defs>
                                    <marker id="arrowhead-${idx}" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                                        <polygon points="0 0, 10 3, 0 6" fill="${comp.color}" />
                                    </marker>
                                </defs>
                                <line x1="0" y1="10" x2="90" y2="10" stroke="${comp.color}" stroke-width="2" marker-end="url(#arrowhead-${idx})" />
                            </svg>
                        </div>
                    ` : ''}
                </div>
            `).join('')}
        </div>
        
        <style>
            .arch-component {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 1rem;
                position: relative;
            }
            
            .arch-icon {
                width: 100px;
                height: 100px;
                border-radius: 1rem;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
                transition: transform 0.3s ease;
            }
            
            .arch-icon:hover {
                transform: scale(1.1) translateY(-5px);
            }
            
            .arch-name {
                font-weight: 700;
                font-size: 1.25rem;
                color: var(--text-primary);
            }
            
            .arch-arrow {
                position: absolute;
                right: -110px;
                top: 45px;
                animation: slideIn 0.6s ease-out;
            }
        </style>
    `;
}

// ===== Message Flow Diagram =====
function initializeMessageFlow() {
    const flow = document.getElementById('messageFlow');

    const steps = [
        { from: 'SMF', to: 'AMF', msg: 'Network Initiated Release', color: '#10b981' },
        { from: 'AMF', to: 'gNB', msg: 'PDU Session Resource Release Command', color: '#f59e0b' },
        { from: 'gNB', to: 'UE', msg: 'NAS PDU (Encrypted)', color: '#7c3aed' },
        { from: 'UE', to: 'UE', msg: 'Decrypt & Close TUN', color: '#00d4ff' },
        { from: 'gNB', to: 'AMF', msg: 'PDU Session Resource Release Response', color: '#f59e0b' },
        { from: 'AMF', to: 'SMF', msg: 'N2 PDU Resource Release Response', color: '#10b981' },
        { from: 'UE', to: 'gNB', msg: 'PDU Session Establishment Request', color: '#00d4ff' }
    ];

    flow.innerHTML = `
        <div class="flow-steps">
            ${steps.map((step, idx) => `
                <div class="flow-step" data-step="${idx}" style="opacity: 0;">
                    <div class="flow-step-number">${idx + 1}</div>
                    <div class="flow-step-content">
                        <div class="flow-participants">
                            <span class="participant" style="color: ${step.color};">${step.from}</span>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width: 20px; height: 20px;">
                                <path d="M5 12h14M12 5l7 7-7 7" stroke-width="2"/>
                            </svg>
                            <span class="participant" style="color: ${step.color};">${step.to}</span>
                        </div>
                        <div class="flow-message" style="border-left-color: ${step.color};">
                            ${step.msg}
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
        
        <style>
            .flow-steps {
                display: flex;
                flex-direction: column;
                gap: 1.5rem;
            }
            
            .flow-step {
                display: flex;
                gap: 1rem;
                align-items: flex-start;
                transition: opacity 0.5s ease, transform 0.5s ease;
            }
            
            .flow-step.active {
                opacity: 1 !important;
                transform: translateX(0) !important;
            }
            
            .flow-step-number {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                background: linear-gradient(135deg, var(--primary), var(--secondary));
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: 700;
                font-size: 1.25rem;
                flex-shrink: 0;
            }
            
            .flow-step-content {
                flex: 1;
                background: var(--bg-tertiary);
                border: 1px solid var(--border-color);
                border-radius: 0.75rem;
                padding: 1rem;
            }
            
            .flow-participants {
                display: flex;
                align-items: center;
                gap: 0.75rem;
                margin-bottom: 0.75rem;
                font-weight: 600;
            }
            
            .participant {
                font-family: var(--font-mono);
            }
            
            .flow-message {
                padding: 0.75rem;
                background: var(--bg-primary);
                border-left: 3px solid;
                border-radius: 0.5rem;
                font-size: 0.875rem;
                color: var(--text-secondary);
            }
        </style>
    `;
}

// ===== Flow Animation =====
let flowAnimationInterval = null;

function startFlowAnimation() {
    const steps = document.querySelectorAll('.flow-step');
    let currentStep = 0;

    // Reset all steps
    steps.forEach(step => {
        step.style.opacity = '0';
        step.style.transform = 'translateX(-20px)';
        step.classList.remove('active');
    });

    // Clear existing interval
    if (flowAnimationInterval) {
        clearInterval(flowAnimationInterval);
    }

    // Animate steps
    flowAnimationInterval = setInterval(() => {
        if (currentStep < steps.length) {
            steps[currentStep].classList.add('active');
            currentStep++;
        } else {
            clearInterval(flowAnimationInterval);
        }
    }, 800);
}

function resetFlowAnimation() {
    if (flowAnimationInterval) {
        clearInterval(flowAnimationInterval);
    }

    const steps = document.querySelectorAll('.flow-step');
    steps.forEach(step => {
        step.style.opacity = '0';
        step.style.transform = 'translateX(-20px)';
        step.classList.remove('active');
    });
}

// ===== Generate Mock Data =====
function generateMockData() {
    // Generate sessions
    const ueCount = 8;
    sessions = [];

    for (let i = 1; i <= ueCount; i++) {
        const isActive = Math.random() > 0.3;
        const lastActive = new Date(Date.now() - Math.random() * 300000); // Random time in last 5 min

        sessions.push({
            id: `PDU-${i}`,
            supi: `imsi-20893000000000${i}`,
            ip: `10.60.0.${100 + i}`,
            status: isActive ? 'active' : (Math.random() > 0.5 ? 'idle' : 'released'),
            lastActive: lastActive,
            idleTime: isActive ? 0 : Math.floor((Date.now() - lastActive) / 1000),
            slice: { sst: 1, sd: '010203' },
            dnn: 'internet'
        });
    }

    // Generate cleanup events
    cleanupEvents = [
        {
            time: new Date(Date.now() - 120000),
            type: 'cleanup',
            title: 'Session Cleanup Triggered',
            description: 'Idle timeout exceeded for PDU-3 (60s)',
            icon: '🧹'
        },
        {
            time: new Date(Date.now() - 90000),
            type: 'release',
            title: 'Network Initiated Release',
            description: 'SMF sent release command to AMF',
            icon: '📤'
        },
        {
            time: new Date(Date.now() - 60000),
            type: 'ue-release',
            title: 'UE Processed Release',
            description: 'UE closed TUN interface successfully',
            icon: '📱'
        },
        {
            time: new Date(Date.now() - 30000),
            type: 'reconnect',
            title: 'UE Auto Reconnect',
            description: 'New PDU Session established',
            icon: '🔄'
        },
        {
            time: new Date(Date.now() - 10000),
            type: 'scan',
            title: 'Periodic Scan',
            description: 'Scanned 8 sessions, 0 idle',
            icon: '🔍'
        }
    ];

    // Update stats
    // totalSessions = all existing sessions (active + idle, excluding released)
    stats.totalSessions = sessions.filter(s => s.status === 'active' || s.status === 'idle').length;
    stats.cleanedSessions = sessions.filter(s => s.status === 'released').length;
    stats.avgIdleTime = Math.floor(sessions.reduce((sum, s) => sum + s.idleTime, 0) / sessions.length);
    stats.successRate = 100;
}

// ===== Update Dashboard =====
function updateDashboard() {
    // Update stats
    document.getElementById('totalSessions').textContent = stats.totalSessions;
    document.getElementById('cleanedSessions').textContent = stats.cleanedSessions;
    document.getElementById('avgIdleTime').textContent = `${stats.avgIdleTime}s`;
    document.getElementById('successRate').textContent = `${stats.successRate}%`;

    // Update sessions list
    updateSessionsList();

    // Update timeline
    updateTimeline();
}

// ===== Update Sessions List =====
function updateSessionsList() {
    const list = document.getElementById('sessionsList');

    if (sessions.length === 0) {
        list.innerHTML = `
            <div style="text-align: center; padding: 3rem 2rem; color: var(--text-secondary);">
                <div style="font-size: 3rem; margin-bottom: 1rem;">📱</div>
                <div style="font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem; color: var(--text-primary);">
                    No Active PDU Sessions
                </div>
                <div style="font-size: 0.875rem; color: var(--text-tertiary); margin-bottom: 1.5rem;">
                    Start a UE to see real-time session data
                </div>
                <div style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 0.5rem; padding: 1rem; font-family: var(--font-mono); font-size: 0.875rem; color: var(--primary);">
                    cd /home/ubuntu/CNDI_final/free-ran-ue<br>
                    make ns-ue
                </div>
            </div>
        `;
        return;
    }

    list.innerHTML = sessions.map(session => `
        <div class="session-item slide-in">
            <div class="session-header">
                <span class="session-id">${session.id}</span>
                <span class="session-status ${session.status}">${session.status}</span>
            </div>
            <div class="session-details">
                <div class="session-detail">
                    <span class="detail-label">SUPI</span>
                    <span class="detail-value">${session.supi}</span>
                </div>
                <div class="session-detail">
                    <span class="detail-label">IP Address</span>
                    <span class="detail-value">${session.ip}</span>
                </div>
                <div class="session-detail">
                    <span class="detail-label">DNN</span>
                    <span class="detail-value">${session.dnn}</span>
                </div>
                <div class="session-detail">
                    <span class="detail-label">Idle Time</span>
                    <span class="detail-value">${session.idleTime}s</span>
                </div>
            </div>
        </div>
    `).join('');
}

// ===== Update Timeline =====
function updateTimeline() {
    const timeline = document.getElementById('cleanupTimeline');

    if (cleanupEvents.length === 0) {
        timeline.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-tertiary);">No recent events</div>';
        return;
    }

    timeline.innerHTML = cleanupEvents.map(event => `
        <div class="timeline-item fade-in">
            <div class="timeline-dot">${event.icon}</div>
            <div class="timeline-content">
                <div class="timeline-time">${formatTime(event.time)}</div>
                <div class="timeline-title">${event.title}</div>
                <div class="timeline-description">${event.description}</div>
            </div>
        </div>
    `).join('');
}

// ===== Refresh Sessions =====
function refreshSessions() {
    const btn = document.querySelector('.btn-refresh');
    btn.style.transform = 'rotate(360deg)';

    setTimeout(() => {
        if (USE_REAL_DATA) {
            fetchRealData().then(() => {
                updateDashboard();
                btn.style.transform = 'rotate(0deg)';
            });
        } else {
            generateMockData();
            updateDashboard();
            btn.style.transform = 'rotate(0deg)';
        }
    }, 500);
}

// ===== Auto Refresh =====
function startAutoRefresh() {
    setInterval(() => {
        if (USE_REAL_DATA) {
            fetchRealData().then(() => {
                updateDashboard();
            });
        } else {
            // Simulate session changes for mock data
            sessions.forEach(session => {
                if (session.status === 'active' && Math.random() > 0.95) {
                    session.idleTime += 30;
                    if (session.idleTime > 60) {
                        session.status = 'idle';
                    }
                }
            });

            // totalSessions = all existing sessions (active + idle, excluding released)
            stats.totalSessions = sessions.filter(s => s.status === 'active' || s.status === 'idle').length;
            updateDashboard();
        }
    }, 5000); // Refresh every 3 seconds
}

// ===== Config Tabs =====
function showConfig(type) {
    // Update tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');

    // Update panels
    document.querySelectorAll('.config-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    document.getElementById(`config-${type}`).classList.add('active');
}

// ===== Utility Functions =====
function formatTime(date) {
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
}

function adjustColor(color, amount) {
    const num = parseInt(color.replace('#', ''), 16);
    const r = Math.max(0, Math.min(255, (num >> 16) + amount));
    const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amount));
    const b = Math.max(0, Math.min(255, (num & 0x0000FF) + amount));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// ===== Smooth Scroll =====
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// ===== Add animation on scroll =====
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('fade-in');
        }
    });
}, observerOptions);

// Observe all sections
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('section').forEach(section => {
        observer.observe(section);
    });
});

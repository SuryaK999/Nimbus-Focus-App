import { load } from '@tauri-apps/plugin-store';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';

export type TimerState = 'work' | 'shortBreak' | 'longBreak';

export class TimerEngine {
    // Svelte 5 runes for premium reactive state
    state = $state<TimerState>('work');
    status = $state<'idle' | 'running' | 'paused'>('idle');
    timeLeft = $state<number>(25 * 60); // remaining time in seconds
    durationWork = $state<number>(25); // in minutes
    durationShortBreak = $state<number>(5); // in minutes
    durationLongBreak = $state<number>(15); // in minutes
    longBreakInterval = $state<number>(4); // focus sessions before a long break
    completedSessions = $state<number>(0);
    dailyStreak = $state<number>(0);
    soundEnabled = $state<boolean>(true);
    notificationsEnabled = $state<boolean>(true);

    // Derived states using $derived
    totalDuration = $derived(
        this.state === 'work' ? this.durationWork * 60 :
        this.state === 'shortBreak' ? this.durationShortBreak * 60 :
        this.durationLongBreak * 60
    );

    private intervalId: any = null;
    private tauriStore: Store | null = null;

    constructor() {
        this.initStore();
        this.initNotifications();
    }

    private async initStore() {
        try {
            this.tauriStore = await load('nimbus_store.bin');
            
            const work = await this.tauriStore.get<number>('durationWork');
            if (work) this.durationWork = work;
            
            const sBreak = await this.tauriStore.get<number>('durationShortBreak');
            if (sBreak) this.durationShortBreak = sBreak;
            
            const lBreak = await this.tauriStore.get<number>('durationLongBreak');
            if (lBreak) this.durationLongBreak = lBreak;
            
            const lInterval = await this.tauriStore.get<number>('longBreakInterval');
            if (lInterval) this.longBreakInterval = lInterval;
            
            const sessions = await this.tauriStore.get<number>('completedSessions');
            if (sessions) this.completedSessions = sessions;
            
            const streak = await this.tauriStore.get<number>('dailyStreak');
            if (streak) this.dailyStreak = streak;
            
            const sound = await this.tauriStore.get<boolean>('soundEnabled');
            if (sound !== null && sound !== undefined) this.soundEnabled = sound;
            
            const notif = await this.tauriStore.get<boolean>('notificationsEnabled');
            if (notif !== null && notif !== undefined) this.notificationsEnabled = notif;
            
            this.resetTimer();
        } catch (e) {
            console.error('Tauri Store initialization error:', e);
            this.resetTimer();
        }
    }

    private async initNotifications() {
        try {
            let permission = await isPermissionGranted();
            if (!permission) {
                const response = await requestPermission();
                this.notificationsEnabled = response === 'granted';
            } else {
                this.notificationsEnabled = true;
            }
        } catch (e) {
            console.error('Notification permission error:', e);
        }
    }

    public async saveSettings() {
        if (!this.tauriStore) return;
        try {
            await this.tauriStore.set('durationWork', this.durationWork);
            await this.tauriStore.set('durationShortBreak', this.durationShortBreak);
            await this.tauriStore.set('durationLongBreak', this.durationLongBreak);
            await this.tauriStore.set('longBreakInterval', this.longBreakInterval);
            await this.tauriStore.set('soundEnabled', this.soundEnabled);
            await this.tauriStore.set('notificationsEnabled', this.notificationsEnabled);
            await this.tauriStore.set('completedSessions', this.completedSessions);
            await this.tauriStore.set('dailyStreak', this.dailyStreak);
            await this.tauriStore.save();
        } catch (e) {
            console.error('Failed to save settings:', e);
        }
    }

    public startTimer() {
        if (this.status === 'running') return;
        this.status = 'running';
        
        this.intervalId = setInterval(() => {
            if (this.timeLeft > 0) {
                this.timeLeft -= 1;
            } else {
                this.completeSession();
            }
        }, 1000);
    }

    public pauseTimer() {
        if (this.status !== 'running') return;
        this.status = 'paused';
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    public resetTimer() {
        this.status = 'idle';
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.timeLeft = this.totalDuration;
    }

    public skipSession() {
        this.resetTimer();
        // Just transition to next state without completing stats
        if (this.state === 'work') {
            if ((this.completedSessions + 1) % this.longBreakInterval === 0) {
                this.state = 'longBreak';
            } else {
                this.state = 'shortBreak';
            }
        } else {
            this.state = 'work';
        }
        this.timeLeft = this.totalDuration;
        this.playCalmingChime();
    }

    private async completeSession() {
        this.resetTimer();
        this.playCalmingChime();

        if (this.state === 'work') {
            this.completedSessions += 1;
            await this.checkStreak();
            
            if (this.completedSessions % this.longBreakInterval === 0) {
                this.state = 'longBreak';
                this.sendNotificationMessage(
                    '🌿 Time for a long break!',
                    `🔥 Fantastic! You completed ${this.completedSessions} focus cycles. Rest up for 15 minutes.`
                );
            } else {
                this.state = 'shortBreak';
                this.sendNotificationMessage(
                    '🌿 Focus session complete!',
                    '💧 Stood up? Stretched? Let\'s take a quick 5-minute break.'
                );
            }
        } else {
            this.state = 'work';
            this.sendNotificationMessage(
                '⚡ Break is over!',
                'Ready to dive back in? Let\'s focus.'
            );
        }

        this.timeLeft = this.totalDuration;
        await this.saveSettings();
    }

    private async checkStreak() {
        const todayStr = new Date().toISOString().split('T')[0];
        if (!this.tauriStore) return;
        try {
            const lastDate = await this.tauriStore.get<string>('lastActiveDate');
            
            if (lastDate === todayStr) {
                return; // already active today, no change
            }
            
            if (!lastDate) {
                this.dailyStreak = 1;
            } else {
                const lastActive = new Date(lastDate);
                const today = new Date(todayStr);
                const diffTime = Math.abs(today.getTime() - lastActive.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                if (diffDays === 1) {
                    this.dailyStreak += 1;
                } else if (diffDays > 1) {
                    this.dailyStreak = 1; // streak broke, reset to 1
                }
            }
            
            await this.tauriStore.set('lastActiveDate', todayStr);
        } catch (e) {
            console.error('Streak update failed:', e);
        }
    }

    private sendNotificationMessage(title: string, body: string) {
        if (this.notificationsEnabled) {
            try {
                sendNotification({ title, body });
            } catch (e) {
                console.error('Failed to send native notification:', e);
            }
        }
    }

    public playCalmingChime() {
        if (!this.soundEnabled) return;
        try {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            const ctx = new AudioContextClass();
            const now = ctx.currentTime;
            
            // Calm, meditative A Major chord chime (A4, C#5, E5) staggered to create a gentle harp effect.
            const frequencies = [440.00, 554.37, 659.25];
            
            frequencies.forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + idx * 0.12);
                
                // Meditative envelope with standard linear attack and exponential decay
                gain.gain.setValueAtTime(0, now + idx * 0.12);
                gain.gain.linearRampToValueAtTime(0.12, now + idx * 0.12 + 0.08); // Attack
                gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.12 + 2.4); // Decay
                
                osc.connect(gain);
                gain.connect(ctx.destination);
                
                osc.start(now + idx * 0.12);
                osc.stop(now + idx * 0.12 + 2.6);
            });

            // Clean up and close AudioContext after the chime is done playing to free threads and prevent memory leaks
            setTimeout(() => {
                try {
                    if (ctx.state !== 'closed') {
                        ctx.close();
                    }
                } catch (err) {
                    console.error('Failed to close AudioContext:', err);
                }
            }, 3200);
        } catch (e) {
            console.error('Web Audio chime playback failed:', e);
        }
    }
}

// Singleton global timer instance
export const timer = new TimerEngine();

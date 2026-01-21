// Audio Manager for handling sound effects
class AudioManager {
    constructor() {
        this.sounds = {
            start: new Audio('SoundEffects/start.mp3'),
            click: new Audio('SoundEffects/click.mp3'),
            clack: new Audio('SoundEffects/clack.mp3'),
            win1: new Audio('SoundEffects/win1.mp3'),
            lose: new Audio('SoundEffects/lose.mp3')
        };
        
        // Set default volume levels
        Object.values(this.sounds).forEach(audio => {
            audio.volume = 0.7; // Set to 70% volume
        });
        
        this.enabled = true; // Allow users to disable sounds if needed
    }
    
    play(soundName) {
        if (!this.enabled || !this.sounds[soundName]) return;
        
        try {
            // Reset the audio to beginning and play
            this.sounds[soundName].currentTime = 0;
            this.sounds[soundName].play().catch(error => {
                // Handle autoplay restrictions gracefully
                console.log('Audio play prevented:', error);
            });
        } catch (error) {
            console.log('Audio error:', error);
        }
    }
    
    setEnabled(enabled) {
        this.enabled = enabled;
    }
    
    setVolume(volume) {
        // Volume should be between 0 and 1
        const normalizedVolume = Math.max(0, Math.min(1, volume));
        Object.values(this.sounds).forEach(audio => {
            audio.volume = normalizedVolume;
        });
    }
}


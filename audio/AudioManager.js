// Audio Manager for handling sound effects
class AudioManager {
    constructor() {
        this.sounds = {
            start: new Audio(getSoundPath('START')),
            click: new Audio(getSoundPath('CLICK')),
            clack: new Audio(getSoundPath('CLACK')),
            win1: new Audio(getSoundPath('WIN')),
            lose: new Audio(getSoundPath('LOSE'))
        };
        
        // Set default volume levels
        Object.values(this.sounds).forEach(audio => {
            audio.volume = GAME_CONFIG.DEFAULT_VOLUME;
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


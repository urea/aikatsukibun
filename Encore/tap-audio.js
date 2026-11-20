// Pitch sweeps give the drum skins their body. A short filtered noise burst
// supplies the stick, hand or jingle attack without loading sound files.
const voices = {
  tap:         { wave: 'triangle', from: 240, to: 70,  decay: .12, sweep: .09, attackHz: 6500, noiseLevel: 1,   noiseTime: .055 },
  don:         { wave: 'sine',     from: 172, to: 55,  decay: .20, sweep: .09, attackHz: 1550, noiseLevel: .20, noiseTime: .034 },
  ka:          { wave: 'triangle', from: 840, to: 335, decay: .08, sweep: .03, attackHz: 2700, noiseLevel: .65, noiseTime: .024 },
  'conga-low': { wave: 'sine',     from: 270, to: 126, decay: .16, sweep: .04, attackHz: 1000, noiseLevel: .26, noiseTime: .032 },
  'conga-high':{ wave: 'sine',     from: 385, to: 208, decay: .13, sweep: .04, attackHz: 1650, noiseLevel: .28, noiseTime: .032 },
  clap:        { wave: 'triangle', from: 170, to: 110, decay: .14, sweep: .04, attackHz:  950, noiseLevel: 1.2, noiseTime: .115, toneLevel: .09 },
  tambourine:  { wave: 'square',   from: 3240,to: 2580,decay: .17, sweep: .14, attackHz: 5400, noiseLevel: 1.5, noiseTime: .16,  toneLevel: .12 },
  pulse:       { wave: 'sine',     from: 468, to: 146, decay: .10, sweep: .08, attackHz: 2300, noiseLevel: .09, noiseTime: .018 },
  chime:       { wave: 'sine',     from: 1046,to: 784, decay: .19, sweep: .16, attackHz: 4100, noiseLevel: .11, noiseTime: .025 },
};

export function createTapAudio() {
  let context;
  let noise;
  return (volume, sound = 'tap') => {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio || volume <= 0) return;
      context ||= new Audio();
      if (context.state === 'suspended') context.resume().catch(() => {});
      const voice = voices[sound] ?? voices.tap;
      const now = context.currentTime;
      const gain = context.createGain();
      gain.gain.setValueAtTime(volume / 100 * .35, now);
      gain.gain.exponentialRampToValueAtTime(.001, now + voice.decay);
      gain.connect(context.destination);
      const tone = context.createOscillator();
      tone.type = voice.wave;
      tone.frequency.setValueAtTime(voice.from, now);
      tone.frequency.exponentialRampToValueAtTime(voice.to, now + voice.sweep);
      const body = context.createGain();
      body.gain.value = voice.toneLevel ?? 1;
      tone.connect(body).connect(gain);
      tone.start(now);
      tone.stop(now + voice.decay + .01);
      if (!noise) {
        noise = context.createBuffer(1, Math.ceil(context.sampleRate * .17), context.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      const click = context.createBufferSource();
      const filter = context.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = voice.attackHz;
      click.buffer = noise;
      const attack = context.createGain();
      attack.gain.value = voice.noiseLevel;
      click.connect(filter).connect(attack).connect(gain);
      click.start(now, 0, voice.noiseTime);
      tone.onended = () => {
        tone.disconnect(); body.disconnect(); click.disconnect(); filter.disconnect(); attack.disconnect(); gain.disconnect();
      };
    } catch { /* 効果音非対応の環境でもタップ操作は続けられる。 */ }
  };
}

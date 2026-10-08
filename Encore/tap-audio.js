// 音源ファイルを読み込まず、操作した瞬間に短いタップ音を合成する。
export function createTapAudio() {
  let context;
  let noise;
  return volume => {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio || volume <= 0) return;
      context ||= new Audio();
      if (context.state === 'suspended') context.resume().catch(() => {});
      const now = context.currentTime;
      const gain = context.createGain();
      gain.gain.setValueAtTime(volume / 100 * .35, now);
      gain.gain.exponentialRampToValueAtTime(.001, now + .12);
      gain.connect(context.destination);
      const tone = context.createOscillator();
      tone.type = 'triangle';
      tone.frequency.setValueAtTime(240, now);
      tone.frequency.exponentialRampToValueAtTime(70, now + .09);
      tone.connect(gain);
      tone.start(now);
      tone.stop(now + .13);
      if (!noise) {
        noise = context.createBuffer(1, Math.ceil(context.sampleRate * .055), context.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      const click = context.createBufferSource();
      const filter = context.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 6500;
      click.buffer = noise;
      click.connect(filter);
      filter.connect(gain);
      click.start(now);
      tone.onended = () => { tone.disconnect(); click.disconnect(); filter.disconnect(); gain.disconnect(); };
    } catch { /* 効果音非対応の環境でもタップ操作は続けられる。 */ }
  };
}

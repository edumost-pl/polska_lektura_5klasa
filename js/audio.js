import { el } from './common.js';

const MISSING = 'Nagrania jeszcze nie ma. Można je dodać później.';
const FAILED = 'Nie udało się odtworzyć nagrania.';

export function mountAudio(container, src) {
  container.replaceChildren();

  const section = el('section', 'audio-block');
  section.setAttribute('aria-label', 'Audio');

  const row = el('div', 'audio-row');
  const icon = el('span', 'audio-icon', '🔊');
  icon.setAttribute('aria-hidden', 'true');

  const button = el('button', 'audio-play', '▶ Posłuchaj');
  button.type = 'button';

  const note = el('p', 'audio-note');
  note.hidden = true;

  const range = document.createElement('input');
  range.type = 'range';
  range.className = 'audio-range';
  range.min = '0';
  range.max = '100';
  range.value = '0';
  range.hidden = true;
  range.setAttribute('aria-label', 'Miejsce w nagraniu');

  const audio = document.createElement('audio');
  audio.preload = 'none';
  if (src) audio.src = src;

  const showNote = (text) => {
    note.hidden = false;
    note.textContent = text;
  };

  const setPlaying = (playing) => {
    button.textContent = playing ? '⏸ Pauza' : '▶ Posłuchaj';
    button.setAttribute('aria-pressed', playing ? 'true' : 'false');
  };

  button.addEventListener('click', async () => {
    if (!src) {
      showNote(MISSING);
      return;
    }
    if (!audio.paused) {
      audio.pause();
      setPlaying(false);
      return;
    }
    try {
      await audio.play();
      note.hidden = true;
      setPlaying(true);
    } catch {
      showNote(FAILED);
      setPlaying(false);
    }
  });

  audio.addEventListener('error', () => {
    showNote(FAILED);
    setPlaying(false);
    range.hidden = true;
  });

  audio.addEventListener('loadedmetadata', () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) range.hidden = false;
  });

  audio.addEventListener('timeupdate', () => {
    if (!audio.duration || !Number.isFinite(audio.duration)) return;
    range.value = String((audio.currentTime / audio.duration) * 100);
  });

  audio.addEventListener('ended', () => {
    setPlaying(false);
    range.value = '0';
  });

  range.addEventListener('input', () => {
    if (!audio.duration || !Number.isFinite(audio.duration)) return;
    audio.currentTime = (Number(range.value) / 100) * audio.duration;
  });

  row.append(icon, button);
  section.append(row, range, note, audio);
  container.append(section);
}

function formatClock(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  return [hours, minutes, rest].map((part) => String(part).padStart(2, '0')).join(':');
}

function mediaSrc(src) {
  if (!src || /^(https?:|data:|blob:)/.test(src)) return src || '';
  return src
    .split('/')
    .map((part) => (part === '..' || part === '.' ? part : encodeURIComponent(part)))
    .join('/');
}

export function createBookAudio(src) {
  const audio = document.createElement('audio');
  audio.preload = 'metadata';
  audio.hidden = true;
  const resolved = mediaSrc(src);
  if (resolved) audio.src = resolved;

  let active = null;
  let seekToken = 0;

  const release = () => {
    const current = active;
    active = null;
    current?.onIdle();
  };

  const ready = () => {
    if (audio.readyState >= 1) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const ok = () => {
        cleanup();
        resolve();
      };
      const bad = () => {
        cleanup();
        reject(new Error('audio'));
      };
      const cleanup = () => {
        audio.removeEventListener('loadedmetadata', ok);
        audio.removeEventListener('error', bad);
      };
      audio.addEventListener('loadedmetadata', ok);
      audio.addEventListener('error', bad);
    });
  };

  const claim = (spec) => {
    if (active && active.id !== spec.id) {
      const previous = active;
      active = null;
      previous.onIdle();
    }
    active = spec;
  };

  audio.addEventListener('timeupdate', () => {
    if (!active || active.scrubbing) return;
    if (Number.isFinite(active.end) && audio.currentTime >= active.end) {
      const end = active.end;
      audio.pause();
      if (Number.isFinite(audio.duration)) audio.currentTime = Math.min(end, audio.duration);
      release();
      return;
    }
    active.onTime(audio.currentTime);
  });

  audio.addEventListener('ended', () => release());
  audio.addEventListener('error', () => {
    const current = active;
    active = null;
    current?.onError();
  });

  return {
    audio,
    hasFile: Boolean(resolved),
    isPlaying(id) {
      return Boolean(active && active.id === id && !audio.paused);
    },
    pause() {
      audio.pause();
      release();
    },
    async play(spec) {
      const samePart = active?.id === spec.id;
      if (samePart && !audio.paused) {
        this.pause();
        return;
      }
      claim(spec);
      await ready();
      const end = Number.isFinite(spec.end) ? spec.end : audio.duration;
      const inside = audio.currentTime >= spec.start && (!Number.isFinite(end) || audio.currentTime < end - 0.05);
      if (!samePart || !inside) audio.currentTime = spec.start;
      await audio.play();
    },
    async seek(spec, time) {
      const token = ++seekToken;
      claim(spec);
      await ready();
      if (token !== seekToken) return;
      const limit = Number.isFinite(audio.duration) ? audio.duration : time;
      audio.currentTime = Math.min(Math.max(time, 0), limit);
      if (!spec.scrubbing) spec.onTime(audio.currentTime);
    },
  };
}

export function mountPartAudio(container, player, clip = {}) {
  container.replaceChildren();

  const hasWindow = Number.isFinite(Number(clip.start)) && Number.isFinite(Number(clip.end)) && Number(clip.end) > Number(clip.start);
  const start = hasWindow ? Number(clip.start) : 0;
  const clipEnd = hasWindow ? Number(clip.end) : null;
  const canUse = Boolean(player?.hasFile);
  const partId = String(clip.id || 'part');

  const section = el('section', 'part-player');
  section.setAttribute('aria-label', 'Audio');

  const button = el('button', 'part-play', '▶');
  button.type = 'button';
  button.setAttribute('aria-label', 'Posłuchaj tej części');

  const label = el('span', 'part-play-label', 'Posłuchaj tej części');

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'part-range';
  slider.min = '0';
  slider.max = '100';
  slider.value = '0';
  slider.disabled = !canUse;
  slider.setAttribute('aria-label', 'Miejsce w nagraniu tej części');

  const time = el('span', 'part-time', canUse && clipEnd != null ? `${formatClock(start)} / ${formatClock(clipEnd)}` : '—');

  const note = el('p', 'part-audio-note');
  note.hidden = true;

  const showNote = (text) => {
    note.hidden = false;
    note.textContent = text;
  };

  const setPlaying = (playing) => {
    button.textContent = playing ? '⏸' : '▶';
    button.setAttribute('aria-pressed', playing ? 'true' : 'false');
  };

  const windowEnd = () => {
    if (clipEnd != null) return clipEnd;
    const duration = player.audio.duration;
    return Number.isFinite(duration) && duration > 0 ? duration : start;
  };

  const paintTime = (current) => {
    if (spec.scrubbing || !canUse) return;
    const stop = windowEnd();
    const span = Math.max(stop - start, 0);
    const at = Math.min(Math.max(current - start, 0), span);
    slider.value = String(span > 0 ? (at / span) * 100 : 0);
    time.textContent = span > 0 ? `${formatClock(Math.min(current, stop))} / ${formatClock(stop)}` : '—';
  };

  const spec = {
    id: partId,
    start,
    end: clipEnd,
    scrubbing: false,
    onTime: paintTime,
    onIdle() {
      setPlaying(false);
    },
    onError() {
      showNote(FAILED);
      setPlaying(false);
    },
  };

  const placeFromSlider = () => {
    const stop = windowEnd();
    const span = Math.max(stop - start, 0);
    const at = start + (Number(slider.value) / 100) * span;
    time.textContent = span > 0 ? `${formatClock(at)} / ${formatClock(stop)}` : '—';
    return player.seek(spec, at);
  };

  button.addEventListener('click', async () => {
    if (!canUse) {
      showNote(MISSING);
      return;
    }
    try {
      await player.play(spec);
      if (player.isPlaying(partId)) {
        note.hidden = true;
        setPlaying(true);
      }
    } catch {
      showNote(FAILED);
      setPlaying(false);
    }
  });

  slider.addEventListener('pointerdown', () => {
    spec.scrubbing = true;
  });
  slider.addEventListener('pointerup', () => {
    spec.scrubbing = false;
  });
  slider.addEventListener('pointercancel', () => {
    spec.scrubbing = false;
  });
  slider.addEventListener('input', () => {
    if (!canUse) return;
    spec.scrubbing = true;
    placeFromSlider().catch(() => showNote(FAILED));
  });
  slider.addEventListener('change', () => {
    spec.scrubbing = false;
    if (!canUse) return;
    placeFromSlider().catch(() => showNote(FAILED));
  });

  const row = el('div', 'part-player-row');
  row.append(button, label, slider, time);
  section.append(row, note);
  container.append(section);
}

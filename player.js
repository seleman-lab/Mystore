/* ============================================================
   CinePlayer - Custom HTML5 video player with full controls
   ============================================================ */
class CinePlayer {
  constructor(container, options = {}) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    if (!this.container) return;

    this.options = Object.assign({
      src: null,
      poster: null,
      title: 'Video',
      autoplay: false,
      controls: true,
      embed: false,
      embedUrl: null,
      showBrand: true
    }, options);

    this.playing = false;
    this.userSeeking = false;
    this.hideTimer = null;
    this.volume = 1;
    this.rate = 1;

    this._build();
    this._bindEvents();

    if (this.options.src) this.setSrc(this.options.src);
  }

  _build() {
    const o = this.options;
    this.player = document.createElement('div');
    this.player.className = 'cine-player';

    this.player.innerHTML = `
      <video playsinline ${o.controls ? '' : ''}></video>

      <div class="cp-poster${o.poster ? '' : ' hidden'}" style="${o.poster ? `background-image:url('${o.poster}')` : ''}">
        <button class="cp-big-play" title="Play">
          <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </button>
      </div>

      ${this._spinnerHTML()}

      <div class="cp-skip-flash"></div>

      <div class="cp-top-bar">
        <div class="cp-title">
          <div class="cp-brand">🎬</div>
          <span class="name">${this._esc(o.title)}</span>
        </div>
        ${o.embed && o.embedUrl ? `<a class="cp-embed-badge" href="${o.embedUrl}" target="_blank" rel="noopener">▶ Watch on MyStore</a>` : ''}
      </div>

      <div class="cp-error"><div class="icon">⚠️</div><div class="msg">Could not play this video.</div><div class="detail"></div></div>

      <div class="cp-controls">
        <div class="cp-seek">
          <div class="cp-tooltip"></div>
          <div class="cp-seek-track">
            <div class="cp-seek-buffered"></div>
            <div class="cp-seek-played"></div>
            <div class="cp-seek-thumb"></div>
          </div>
        </div>

        <div class="cp-controls-row">
          <button class="cp-btn" data-action="togglePlay" title="Play/Pause (Space)">
            <svg class="icon-on" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            <svg class="icon-off" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
          </button>
          <button class="cp-btn" data-action="back10" title="Back 10 seconds">
            <svg viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>
          </button>
          <button class="cp-btn" data-action="forward10" title="Forward 10 seconds">
            <svg viewBox="0 0 24 24"><path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/></svg>
          </button>

          <div class="cp-volume">
            <button class="cp-btn" data-action="toggleMute" title="Mute (M)">
              <svg class="icon-on" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3z"/></svg>
              <svg class="icon-off" viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
            </button>
            <input type="range" class="cp-volume-slider" min="0" max="100" value="100" title="Volume">
          </div>

          <div class="cp-time">
            <span class="current">0:00</span><span class="sep">/</span><span class="duration">0:00</span>
          </div>

          <div class="cp-spacer"></div>

          <button class="cp-btn" data-action="theater" title="Theater mode (T)">
            <svg viewBox="0 0 24 24"><path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM5 15h14v3H5z"/></svg>
          </button>
          <button class="cp-btn" data-action="pip" title="Picture in Picture (P)">
            <svg viewBox="0 0 24 24"><path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 1.98 2 1.98h18c1.1 0 2-.88 2-1.98V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z"/></svg>
          </button>
          <div class="cp-speed" style="position:relative; display:flex;">
            <button class="cp-btn" data-action="speed" title="Playback speed">1x</button>
            <div class="cp-speed-menu">
              <button class="cp-speed-item" data-rate="2">2x</button>
              <button class="cp-speed-item" data-rate="1.5">1.5x</button>
              <button class="cp-speed-item active" data-rate="1">1x</button>
              <button class="cp-speed-item" data-rate="0.75">0.75x</button>
              <button class="cp-speed-item" data-rate="0.5">0.5x</button>
            </div>
          </div>
          <button class="cp-btn" data-action="fullscreen" title="Fullscreen (F)">
            <svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
          </button>
        </div>
      </div>
    `;

    this.container.appendChild(this.player);
    this.video = this.player.querySelector('video');
    this.el = {
      poster: this.player.querySelector('.cp-poster'),
      bigPlay: this.player.querySelector('.cp-big-play'),
      spinner: this.player.querySelector('.cp-spinner'),
      skipFlash: this.player.querySelector('.cp-skip-flash'),
      topBar: this.player.querySelector('.cp-top-bar'),
      controls: this.player.querySelector('.cp-controls'),
      seek: this.player.querySelector('.cp-seek'),
      seekPlayed: this.player.querySelector('.cp-seek-played'),
      seekBuffered: this.player.querySelector('.cp-seek-buffered'),
      seekThumb: this.player.querySelector('.cp-seek-thumb'),
      tooltip: this.player.querySelector('.cp-tooltip'),
      current: this.player.querySelector('.cp-time .current'),
      duration: this.player.querySelector('.cp-time .duration'),
      volumeSlider: this.player.querySelector('.cp-volume-slider'),
      muteBtn: this.player.querySelector('[data-action="toggleMute"]'),
      playBtn: this.player.querySelector('[data-action="togglePlay"]'),
      speedBtn: this.player.querySelector('[data-action="speed"]'),
      speedMenu: this.player.querySelector('.cp-speed-menu'),
      error: this.player.querySelector('.cp-error'),
      errorDetail: this.player.querySelector('.cp-error .detail')
    };

    this.video.controls = false;
    this.video.preload = 'metadata';
    if (this.options.poster) this.video.poster = this.options.poster;

    // seek volume sliders initial
    this._updateVolumeUI();
  }

  _spinnerHTML() {
    return `
      <div class="cp-spinner"><div class="ring"></div></div>
      <div class="cp-skip-flash"></div>
    `;
  }

  setSrc(url) {
    this.video.src = url;
    this.video.load();
    if (this.options.autoplay) {
      this.play();
    }
    return this;
  }

  /* ---------- Playback control ---------- */
  play() {
    const p = this.video.play();
    if (p) p.catch(() => {});
    this.playing = true;
    this.el.poster.classList.add('hidden');
    this.el.bigPlay.classList.add('hidden');
    this.el.playBtn.classList.remove('active');
    this._scheduleHide();
  }

  pause() {
    this.video.pause();
    this.playing = false;
    this.el.playBtn.classList.add('active');
    this._showControls();
  }

  togglePlay() {
    if (this.video.paused) this.play();
    else this.pause();
  }

  skip(seconds) {
    const t = this.video.currentTime + seconds;
    this.video.currentTime = Math.max(0, Math.min(t, this.video.duration || 0));
    this.el.skipFlash.innerHTML = `${seconds > 0 ? '▶' : '◀'} ${Math.abs(seconds)}s`;
    this.el.skipFlash.classList.remove('show');
    void this.el.skipFlash.offsetWidth;
    this.el.skipFlash.classList.add('show');
    this._scheduleHide();
  }

  setRate(rate) {
    this.rate = rate;
    this.video.playbackRate = rate;
    this.el.speedBtn.textContent = `${rate}x`;
    this.el.speedMenu.querySelectorAll('.cp-speed-item').forEach(item => {
      item.classList.toggle('active', item.dataset.rate === String(rate));
    });
    this.el.speedMenu.classList.remove('visible');
  }

  toggleMute() {
    this.video.muted = !this.video.muted;
    this.el.muteBtn.classList.toggle('active', this.video.muted);
    this._updateVolumeUI();
  }

  setVolume(v) {
    this.volume = v;
    this.video.volume = v;
    this.video.muted = v === 0;
    this.el.muteBtn.classList.toggle('active', this.video.muted);
    this.el.volumeSlider.value = Math.round(v * 100);
  }

  _updateVolumeUI() {
    this.el.volumeSlider.value = Math.round(this.video.volume * 100);
    this.el.muteBtn.classList.toggle('active', this.video.muted);
  }

  /* ---------- Fullscreen / theater / PiP ---------- */
  toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
      this.player.classList.remove('cp-fullscreen');
    } else {
      if (this.player.requestFullscreen) {
        this.player.requestFullscreen().then(() => this.player.classList.add('cp-fullscreen'));
      } else if (this.player.webkitRequestFullscreen) {
        this.player.webkitRequestFullscreen();
      }
    }
  }

  toggleTheater() {
    const theater = this.player.classList.toggle('cp-theater');
    document.body.classList.toggle('cp-theater', theater);
    const btn = this.player.querySelector('[data-action="theater"]');
    if (btn) btn.classList.toggle('active', theater);
  }

  async togglePiP() {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (this.video.requestPictureInPicture) {
        await this.video.requestPictureInPicture();
      }
    } catch (e) {}
  }

  /* ---------- Seek ---------- */
  _fmt(t) {
    if (!isFinite(t) || t < 0) return '0:00';
    const s = Math.floor(t % 60);
    const m = Math.floor((t / 60) % 60);
    const h = Math.floor(t / 3600);
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  }

  _updateTime() {
    this.el.current.textContent = this._fmt(this.video.currentTime);
    this.el.duration.textContent = this._fmt(this.video.duration);
    const pct = this.video.duration ? (this.video.currentTime / this.video.duration) * 100 : 0;
    this.el.seekPlayed.style.width = pct + '%';
    this.el.seekThumb.style.left = pct + '%';
  }

  _updateBuffered() {
    const b = this.video.buffered;
    if (b.length && this.video.duration) {
      this.el.seekBuffered.style.width = ((b.end(b.length - 1) / this.video.duration) * 100) + '%';
    }
  }

  _timeFromEvent(e) {
    const rect = this.el.seek.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return x * (this.video.duration || 0);
  }

  /* ---------- Control visibility ---------- */
  _showControls() {
    this.player.classList.remove('controls-hidden');
    clearTimeout(this.hideTimer);
    if (this.playing) this._scheduleHide();
  }

  _scheduleHide() {
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => {
      if (this.playing && !this.userSeeking) {
        this.player.classList.add('controls-hidden');
      }
    }, 2600);
  }

  /* ---------- Events ---------- */
  _bindEvents() {
    const v = this.video;

    v.addEventListener('play', () => {
      this.playing = true;
      this.el.poster.classList.add('hidden');
      this.el.bigPlay.classList.add('hidden');
      this.el.playBtn.classList.remove('active');
    });
    v.addEventListener('pause', () => {
      this.playing = false;
      this.el.playBtn.classList.add('active');
      this._showControls();
    });
    v.addEventListener('timeupdate', () => this._updateTime());
    v.addEventListener('progress', () => this._updateBuffered());
    v.addEventListener('durationchange', () => this._updateTime());

    v.addEventListener('waiting', () => this.el.spinner.classList.add('visible'));
    v.addEventListener('playing', () => this.el.spinner.classList.remove('visible'));
    v.addEventListener('canplay', () => this.el.spinner.classList.remove('visible'));

    v.addEventListener('error', () => {
      this.el.spinner.classList.remove('visible');
      this.el.error.classList.add('visible');
      const msg = v.error ? v.error.message : '';
      this.el.errorDetail.textContent = msg;
    });

    v.addEventListener('volumechange', () => this._updateVolumeUI());

    // Click video toggles playback
    this.video.addEventListener('click', (e) => {
      if (this.el.error.classList.contains('visible')) return;
      this.togglePlay();
    });

    // Big play button
    this.el.bigPlay.addEventListener('click', () => this.play());

    // Control buttons (delegated)
    this.player.querySelectorAll('.cp-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (btn.closest('.cp-speed') && btn.dataset.action === 'speed') {
          this.el.speedMenu.classList.toggle('visible');
          e.stopPropagation();
          return;
        }
        switch (btn.dataset.action) {
          case 'togglePlay': this.togglePlay(); break;
          case 'back10': this.skip(-10); break;
          case 'forward10': this.skip(10); break;
          case 'toggleMute': this.toggleMute(); break;
          case 'theater': this.toggleTheater(); break;
          case 'pip': this.togglePiP(); break;
          case 'fullscreen': this.toggleFullscreen(); break;
        }
        if (btn.dataset.action !== 'speed') this.el.speedMenu.classList.remove('visible');
      });
    });

    // Speed items
    this.el.speedMenu.querySelectorAll('.cp-speed-item').forEach(item => {
      item.addEventListener('click', () => {
        this.setRate(parseFloat(item.dataset.rate));
      });
    });

    // Seek bar
    this.el.seek.addEventListener('mousemove', (e) => {
      const t = this._timeFromEvent(e);
      this.el.tooltip.textContent = this._fmt(t);
      const rect = this.el.seek.getBoundingClientRect();
      this.el.tooltip.style.left = Math.min(Math.max((e.clientX - rect.left) / rect.width * 100, 8), 92) + '%';
      this.el.tooltip.classList.add('visible');
    });
    this.el.seek.addEventListener('mouseleave', () => this.el.tooltip.classList.remove('visible'));

    this.el.seek.addEventListener('mousedown', (e) => {
      this.userSeeking = true;
      this.video.pause();
      this.video.currentTime = this._timeFromEvent(e);
    });
    this.el.seek.addEventListener('mousemove', (e) => {
      if (this.userSeeking) {
        this.video.currentTime = this._timeFromEvent(e);
      }
    });
    window.addEventListener('mouseup', () => {
      if (this.userSeeking) {
        this.userSeeking = false;
        if (!this.video.paused) {} else { this.video.play().catch(() => {}); }
      }
    });
    this.el.seek.addEventListener('click', (e) => {
      this.video.currentTime = this._timeFromEvent(e);
    });

    // Volume
    this.el.volumeSlider.addEventListener('input', (e) => {
      this.setVolume(e.target.value / 100);
    });

    // Mouse movement shows controls
    this.player.addEventListener('mousemove', () => {
      if (this.playing) this._showControls();
    });
    this.player.addEventListener('mouseleave', () => {
      if (this.playing) this._scheduleHide();
    });
    this.player.addEventListener('dblclick', (e) => {
      if (!e.target.closest('.cp-controls')) this.toggleFullscreen();
    });

    // Click outside speed menu closes it
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.cp-speed')) this.el.speedMenu.classList.remove('visible');
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (!this.player.getRootNode) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;
      if (this.options.embed && !this.player.contains(document.activeElement) && this.player.getRootNode() !== document) return;

      switch (e.key.toLowerCase()) {
        case ' ': e.preventDefault(); this.togglePlay(); break;
        case 'k': this.togglePlay(); break;
        case 'm': this.toggleMute(); break;
        case 'f': this.toggleFullscreen(); break;
        case 't': this.toggleTheater(); break;
        case 'p': this.togglePiP(); break;
        case 'arrowleft': this.skip(-10); break;
        case 'arrowright': this.skip(10); break;
        case 'arrowup': e.preventDefault(); this.setVolume(Math.min(1, this.video.volume + 0.1)); break;
        case 'arrowdown': e.preventDefault(); this.setVolume(Math.max(0, this.video.volume - 0.1)); break;
      }
    });
  }

  _esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  destroy() {
    if (this.player && this.player.parentNode) this.player.parentNode.removeChild(this.player);
  }
}

/* Auto-init for elements with data-player */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-cine-player]').forEach(el => {
    new CinePlayer(el, {
      src: el.dataset.src,
      poster: el.dataset.poster,
      title: el.dataset.title || 'Video',
      autoplay: el.dataset.autoplay === 'true',
      embed: el.dataset.embed === 'true',
      embedUrl: el.dataset.embedUrl || null
    });
  });
});
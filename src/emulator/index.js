import {
  RetroAppWrapper,
  ScriptAudioProcessor,
  DisplayLoop,
  LOG
} from '@webrcade/app-common';

export class Emulator extends RetroAppWrapper {

  GAME_SRAM_NAME = 'game.srm';
  SAVE_NAME = 'sav';

  constructor(app, debug = false) {
    super(app, debug);
    window.emulator = this;

    this.rotValue = 0;
    this.rotSideways = false;

    this.audioStarted = 0;
    this.audioCallback = (offset, length) => {
      length = length << 1;
      const audioArray = new Int16Array(window.Module.HEAP16.buffer, offset, length);
      this.audioProcessor.storeSoundCombinedInput(audioArray, 2, length, 0, 32768);
    };
  }

  createAudioProcessor() {
    return new ScriptAudioProcessor(
      2,
      48000,
      32768,
      4096
    ).setDebug(this.debug);
  }

  onFrame() {
    if (this.audioStarted !== -1) {
      if (this.audioStarted > 1) {
        this.audioStarted = -1;
        // Start the audio processor
        this.audioProcessor.start();
      } else {
        this.audioStarted++;
      }
    }
  }


  getScriptUrl() {
    return 'js/mgba_libretro.js';
  }

  getPrefs() {
    return this.prefs;
  }

  sendInput(controller, input, analog0x, analog0y, analog1x, analog1y) {
    const rotValue = this.rotValue;
    if (this.rotValue !== 0) {
      const isUp    = input & this.INP_UP;
      const isRight = input & this.INP_RIGHT;
      const isDown  = input & this.INP_DOWN;
      const isLeft  = input & this.INP_LEFT;

      input = input & ~(this.INP_LEFT | this.INP_RIGHT | this.INP_UP | this.INP_DOWN); // clear D-pad bits

      switch (rotValue) {
        case 1: // 90° CW
          if (isUp)    input |= this.INP_LEFT;
          if (isRight) input |= this.INP_UP;
          if (isDown)  input |= this.INP_RIGHT;
          if (isLeft)  input |= this.INP_DOWN;
          break;

        case 2: // 180°
          if (isUp)    input |= this.INP_DOWN;
          if (isRight) input |= this.INP_LEFT;
          if (isDown)  input |= this.INP_UP;
          if (isLeft)  input |= this.INP_RIGHT;
          break;

        case 3: // 270° CW (or 90° CCW)
          if (isUp)    input |= this.INP_RIGHT;
          if (isRight) input |= this.INP_DOWN;
          if (isDown)  input |= this.INP_LEFT;
          if (isLeft)  input |= this.INP_UP;
          break;
        default:
          break;
      }
    }

    if (!this.getDisableInput()) {
      window.Module._wrc_set_input(
        controller,
        input,
        analog0x,
        analog0y,
        analog1x,
        analog1y,
      );
    } else {
      window.Module._wrc_set_input(
        controller, 0, 0, 0, 0, 0
      );
    }
  }

  async saveState() {
    const { saveStatePath, started } = this;
    const { FS, Module } = window;

    try {
      if (!started) {
        return;
      }

      // Save to files
      Module._cmd_savefiles();

      let path = '';
      const files = [];
      let s = null;

      path = `/home/web_user/retroarch/userdata/saves/${this.GAME_SRAM_NAME}`;
      LOG.info('Checking: ' + path);
      try {
        s = FS.readFile(path);
        if (s) {
          LOG.info('Found save file: ' + path);
          let hasData = false;
          for (let i = 0; i < s.length; i++) {
            if (s[i] !== 0xFF) {
              hasData = true;
              break; // exit early
            }
          }

          if (hasData) {
            LOG.info('File has content: ' + path);
            files.push({
              name: this.SAVE_NAME,
              content: s,
            });
          } else {
            LOG.info('Skipping empty file: ' + path);
          }
        }
        // if (s) {
        //   LOG.info('Found save file: ' + path);
        //   files.push({
        //     name: this.SAVE_NAME,
        //     content: s,
        //   });
        // }
      } catch (e) {}

      if (files.length > 0) {
        if (await this.getSaveManager().checkFilesChanged(files)) {
          await this.getSaveManager().save(
            saveStatePath,
            files,
            this.saveMessageCallback,
          );
        }
      } else {
        await this.getSaveManager().delete(path);
      }
    } catch (e) {
      LOG.error('Error persisting save state: ' + e);
    }
  }

  async loadState() {
    const { saveStatePath } = this;
    const { FS } = window;

    // Write the save state (if applicable)
    try {
      // Load
      const files = await this.getSaveManager().load(
        saveStatePath,
        this.loadMessageCallback,
      );

      if (files) {
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          if (f.name === this.SAVE_NAME) {
            LOG.info(`writing ${this.GAME_SRAM_NAME} file`);
            FS.writeFile(
              `/home/web_user/retroarch/userdata/saves/${this.GAME_SRAM_NAME}`,
              f.content,
            );
          }
        }

        // Cache the initial files
        await this.getSaveManager().checkFilesChanged(files);
      }
    } catch (e) {
      LOG.error('Error loading save state: ' + e);
    }
  }

  isEscapeHackEnabled() {
    return false;
  }

  applyGameSettings() {
    const props = this.getProps();

    // Get the ROM rotation (if applicable)
    const rot = props.rotation;
    if (rot) {
      const rotInt = parseInt(rot);
      if (!isNaN(rotInt)) {
        if (rotInt % 90 === 0) {
          this.rotValue = (rotInt / 90) % 4;
          if (this.rotValue % 2 !== 0) {
            this.rotSideways = true;
          }
        } else {
          LOG.error('rotation value is not a 90 degree value: ' + rot);
        }
      } else {
        LOG.error('rotation value is not a number: ' + rot);
      }
    }

    // let options = 0;

    // // b buttons
    // if (props.pad6button) {
    //   LOG.info('## 6 button pad on');
    //   options |= this.OPT1;
    // } else {
    //   LOG.info('## 6 button pad off');
    // }

    // // map RUN/SELECT
    // if (props.mapRunSelect) {
    //   LOG.info('## Map run and select on');
    //   options |= this.OPT2;
    // } else {
    //   LOG.info('## Map run and select off');
    // }

    // Module._wrc_set_options(options);
  }

  updateScreenSize() {
    super.updateScreenSize()

    const canvas = this.canvas;
    if (canvas) {
      if (this.rotValue === 1 || this.rotValue === 3) {
        const w = canvas.width;
        const h = canvas.height;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        // Calculate scaling factor depending on rotation
        const rotated = true;
        const cw = rotated ? h : w;
        const ch = rotated ? w : h;

        // Scale to fit inside viewport
        const scale = Math.min(vw / cw, vh / ch);

        canvas.style.setProperty(
          'transform',
          `rotate(${this.rotValue * 90}deg) scale(${scale})`,
          'important'
        );
      }
    }
  }

  isDisableLookup() {
    const props = this.getProps();
    return props.disableLookup ? 1 : 0;
  }

  enableRTC() {
    const props = this.getProps();
    return props.rtc ? 1 : 0;
  }

  saveType() {
    const props = this.getProps();
    return props.saveType ? props.saveType : 0;
  }

  flashSize() {
    const props = this.getProps();
    return props.flashSize ? props.flashSize : (64 * 1024);
  }

  isForceAspectRatio() {
    return false;
  }

  getDefaultAspectRatio() {
    return 1.5;
    // if (!this.isGba) {
    //   ar = this.gbBorder ? 1.15 : 1.11;
    // }
    // return ar;
  }

  resizeScreen(canvas) {
    this.canvas = canvas;
    this.updateScreenSize();
  }

  createDisplayLoop(debug) {
    const loop = new DisplayLoop(
      60 /*this.frequency*/,
      true, // vsync
      debug, // debug
      false,
    );
    //loop.setAdjustTimestampEnabled(false);
    return loop;
  }

  getShotAspectRatio() { return this.getDefaultAspectRatio(); }
}


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

  // sendInput(controller, input, analog0x, analog0y, analog1x, analog1y) {
  //   const { controllers } = this;

  //   if (controllers.isControlDown(0, CIDS.SELECT)) {
  //     this.selectDown = true;
  //   } else {
  //     if (this.selectDown) {
  //       this.rotated = !this.rotated;
  //       this.resizeScreen(this.canvas);
  //       this.selectDown = false;
  //     }
  //   }

  //   let isLeft = false;
  //   let isRight = false;
  //   let isUp = false;
  //   let isDown = false;

  //   if (controllers.isAxisLeft(0, 1)) {
  //     isLeft = true;
  //   }
  //   if (controllers.isAxisRight(0, 1)) {
  //     isRight = true;
  //   }
  //   if (controllers.isAxisUp(0, 1)) {
  //     isUp = true;
  //   }
  //   if (controllers.isAxisDown(0, 1)) {
  //     isDown = true;
  //   }

  //   if (!this.getDisableInput()) {
  //     window.Module._wrc_set_input(
  //       controller,
  //       input,
  //       analog0x,
  //       analog0y,
  //       isLeft ? .25 : isRight ? .5 : 0,
  //       isUp ? .25 : isDown ? .5 : 0,
  //     );
  //   } else {
  //     window.Module._wrc_set_input(
  //       controller, 0, 0, 0, 0, 0
  //     );
  //   }
  // }

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
    // const { Module } = window;
    // const props = this.getProps();
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

  isForceAspectRatio() {
    return false;
  }

  // isRotated() {
  //   return this.rotated;
  // }

  // isJapanese() {
  //   return this.japanese;
  // }

  getDefaultAspectRatio() {
    let ar = 1.5;
    // if (!this.isGba) {
    //   ar = this.gbBorder ? 1.15 : 1.11;
    // }
    return ar;
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


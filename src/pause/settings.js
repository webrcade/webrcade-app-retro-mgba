import React from 'react';
import { Component } from 'react';

import {
  AppDisplaySettingsTab,
  EditorScreen,
  TelevisionWhiteImage,
  BlurImage,
  ShaderSettingsTab,
} from '@webrcade/app-common';

export class NesSettingsEditor extends Component {
  constructor() {
    super();
    this.state = {
      tabIndex: null,
      focusGridComps: null,
      values: {},
    };

    this.busy = false;
  }

  componentDidMount() {
    const { emulator } = this.props;

    const values = {
      origBilinearMode: emulator.getPrefs().isBilinearEnabled(),
      bilinearMode: emulator.getPrefs().isBilinearEnabled(),
      origScreenSize: emulator.getPrefs().getScreenSize(),
      screenSize: emulator.getPrefs().getScreenSize(),
    }

    this.shaderService = this.props.emulator.getShadersService();
    this.shaderService.addEditorValues(values);

    this.setState({
      values: values
    });
  }

  render() {
    const { emulator, onClose, showOnScreenControls } = this.props;
    const { tabIndex, values, focusGridComps } = this.state;

    const setFocusGridComps = (comps) => {
      this.setState({ focusGridComps: comps });
    };

    const setValues = (values) => {
      this.setState({ values: values });
    };

    const tabs = [];

    let tab = 0;

    tabs.push({
        image: TelevisionWhiteImage,
        label: 'Display Settings',
        content: (
          <AppDisplaySettingsTab
            emulator={emulator}
            isActive={tabIndex === tab}
            showOnScreenControls={showOnScreenControls}
            setFocusGridComps={setFocusGridComps}
            values={values}
            setValues={setValues}
          />
        )
    });
    tab++;

    tabs.push({
      image: BlurImage,
      label: 'Shader Settings',
      content: (
        <ShaderSettingsTab
          shaderService={this.shaderService}
          emulator={emulator}
          isActive={tabIndex === tab}
          setFocusGridComps={setFocusGridComps}
          values={values}
          setValues={setValues}
        />
      )
    });

    return (
      <EditorScreen
        showCancel={true}
        onOk={async () => {
          if (this.busy) return;
          this.busy = true;

          let change = false;
          if (values.origBilinearMode !== values.bilinearMode) {
            emulator.getPrefs().setBilinearEnabled(values.bilinearMode);
            emulator.updateBilinearFilter();
            change = true;
          }
          if (values.origScreenSize !== values.screenSize) {
            emulator.getPrefs().setScreenSize(values.screenSize);
            emulator.updateScreenSize();
            change = true;
          }
          if (change) {
            emulator.getPrefs().save();
          }

          // Set the shader
          await this.shaderService.setShader(values.shaderId);

          onClose();
        }}
        onClose={onClose}
        focusGridComps={focusGridComps}
        onTabChange={(oldTab, newTab) => this.setState({ tabIndex: newTab })}
        tabs={tabs}
      />
    );
  }
}


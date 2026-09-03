// tests/components/inspector-color-input.test.tsx
// Testes unitários para InspectorColorInput (CORE.E6A).

import React, { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  InspectorColorInput,
  normalizeHexColor
} from '../../src/components/editor/inspector/components/InspectorColorInput';

describe('InspectorColorInput (CORE.E6A)', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount();
      });
    }
    container.remove();
  });

  const setInputValue = (input: HTMLInputElement, value: string) => {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set;
    nativeSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const ControlledWrapper: React.FC<{
    initialValue: string;
    onChange: (val: string) => void;
  }> = ({ initialValue, onChange }) => {
    const [color, setColor] = useState(initialValue);
    return (
      <InspectorColorInput
        id="test-color-input"
        value={color}
        onChange={(val) => {
          setColor(val);
          onChange(val);
        }}
      />
    );
  };

  it('COLOR-NORM-1: normaliza #RGB e #RRGGBB para formato canônico 6 dígitos uppercase', () => {
    expect(normalizeHexColor('#036')).toBe('#003366');
    expect(normalizeHexColor('#ffc20e')).toBe('#FFC20E');
    expect(normalizeHexColor('abc')).toBe('#AABBCC');
    expect(normalizeHexColor('invalid')).toBeNull();
    expect(normalizeHexColor('#12345')).toBeNull();
  });

  it('COLOR-INPUT-1: aceita e comita valor hexadecimal válido em caixa alta', () => {
    const onChangeSpy = vi.fn();

    act(() => {
      root!.render(<ControlledWrapper initialValue="#003366" onChange={onChangeSpy} />);
    });

    const textInput = container.querySelector('#test-color-input') as HTMLInputElement;
    expect(textInput).not.toBeNull();
    expect(textInput.value).toBe('#003366');

    // Digitar valor válido de 3 dígitos e pressionar Enter
    act(() => {
      setInputValue(textInput, '#f00');
      textInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onChangeSpy).toHaveBeenCalledTimes(1);
    expect(onChangeSpy).toHaveBeenCalledWith('#FF0000');
    expect(textInput.value).toBe('#FF0000');

    // Digitar valor válido de 6 dígitos e dar blur
    onChangeSpy.mockClear();
    act(() => {
      setInputValue(textInput, '#1e3a8a');
      textInput.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      textInput.dispatchEvent(new Event('blur', { bubbles: true }));
    });

    expect(onChangeSpy).toHaveBeenCalledTimes(1);
    expect(onChangeSpy).toHaveBeenCalledWith('#1E3A8A');
    expect(textInput.value).toBe('#1E3A8A');
  });

  it('COLOR-INPUT-2: valor inválido não comita e restaura o último valor válido no blur', () => {
    const onChangeSpy = vi.fn();

    act(() => {
      root!.render(<ControlledWrapper initialValue="#003366" onChange={onChangeSpy} />);
    });

    const textInput = container.querySelector('#test-color-input') as HTMLInputElement;

    // Digitar texto inválido e pressionar Enter
    act(() => {
      setInputValue(textInput, 'not-a-color');
      textInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onChangeSpy).not.toHaveBeenCalled();
    expect(textInput.value).toBe('#003366');

    // Digitar hex incompleto e dar blur
    act(() => {
      setInputValue(textInput, '#1234');
      textInput.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      textInput.dispatchEvent(new Event('blur', { bubbles: true }));
    });

    expect(onChangeSpy).not.toHaveBeenCalled();
    expect(textInput.value).toBe('#003366');
  });
});

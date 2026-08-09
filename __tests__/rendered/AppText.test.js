import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import AppText from '../../src/components/AppText';
import { AccessibilityContext } from '../../src/context/AccessibilityContext';

const renderAt = (textScale, ui) =>
  render(
    <AccessibilityContext.Provider value={{ textScale, getScaledSize: (n) => n * textScale }}>
      {ui}
    </AccessibilityContext.Provider>
  );

const sizeOf = (node) => StyleSheet.flatten(node.props.style).fontSize;
const lineHeightOf = (node) => StyleSheet.flatten(node.props.style).lineHeight;

describe('AppText', () => {
  it('leaves the size alone at the default scale', () => {
    renderAt(1, <AppText style={{ fontSize: 14 }}>Hello</AppText>);
    expect(sizeOf(screen.getByText('Hello'))).toBe(14);
  });

  it('scales the size up', () => {
    renderAt(1.2, <AppText style={{ fontSize: 15 }}>Hello</AppText>);
    expect(sizeOf(screen.getByText('Hello'))).toBe(18);
  });

  it('scales the size down', () => {
    renderAt(0.9, <AppText style={{ fontSize: 20 }}>Hello</AppText>);
    expect(sizeOf(screen.getByText('Hello'))).toBe(18);
  });

  it("scales React Native's default size when the style sets none", () => {
    renderAt(2, <AppText style={{ color: '#000' }}>Hello</AppText>);
    expect(sizeOf(screen.getByText('Hello'))).toBe(28);
  });

  it('handles no style at all', () => {
    renderAt(2, <AppText>Hello</AppText>);
    expect(sizeOf(screen.getByText('Hello'))).toBe(28);
  });

  it('reads the size out of a style array, as callers pass', () => {
    renderAt(2, <AppText style={[{ fontSize: 10 }, { fontWeight: '700' }]}>Hello</AppText>);
    expect(sizeOf(screen.getByText('Hello'))).toBe(20);
  });

  it('lets a later style in the array win, as StyleSheet.flatten does', () => {
    renderAt(2, <AppText style={[{ fontSize: 10 }, { fontSize: 12 }]}>Hello</AppText>);
    expect(sizeOf(screen.getByText('Hello'))).toBe(24);
  });

  it('scales lineHeight with the text so large sizes do not clip', () => {
    renderAt(2, <AppText style={{ fontSize: 10, lineHeight: 14 }}>Hello</AppText>);
    expect(lineHeightOf(screen.getByText('Hello'))).toBe(28);
  });

  it('leaves lineHeight unset when the style did not set one', () => {
    renderAt(2, <AppText style={{ fontSize: 10 }}>Hello</AppText>);
    expect(lineHeightOf(screen.getByText('Hello'))).toBeUndefined();
  });

  it('keeps the rest of the style', () => {
    renderAt(1.2, <AppText style={{ fontSize: 10, color: '#ff0000' }}>Hello</AppText>);
    expect(StyleSheet.flatten(screen.getByText('Hello').props.style).color).toBe('#ff0000');
  });

  it('passes other props through to Text', () => {
    renderAt(1, <AppText numberOfLines={2} accessibilityLabel="greeting">Hello</AppText>);
    const node = screen.getByLabelText('greeting');
    expect(node.props.numberOfLines).toBe(2);
  });
});

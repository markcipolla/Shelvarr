/**
 * react-reader's own chrome, re-themed.
 *
 * react-reader styles its frame with inline `CSSProperties` — a hard-coded
 * white reading area, grey arrows, a light-grey contents drawer — which CSS
 * cannot override and which looks broken the moment someone picks Dark. The
 * component does accept a complete `readerStyles` object, so this rebuilds
 * one from the chosen palette.
 *
 * The layout numbers (the 256px drawer, the 50px gutters the page-turn arrows
 * sit in) are react-reader's and are kept as-is: they are what its markup
 * expects, not preferences of ours.
 *
 * Note this deliberately does not import `ReactReaderStyle` to spread over.
 * The object is small, and the reader's unit tests replace the whole
 * `react-reader` module with a stub — importing a second binding from it
 * would make every one of those tests fail to link.
 */

import type { IReactReaderStyle } from 'react-reader';
import type { ReaderThemePalette } from './preferences';

export function buildReaderStyles(palette: ReaderThemePalette): IReactReaderStyle {
  return {
    container: {
      overflow: 'hidden',
      position: 'relative',
      height: '100%',
    },
    readerArea: {
      position: 'relative',
      zIndex: 1,
      height: '100%',
      width: '100%',
      backgroundColor: palette.background,
      transition: 'all .3s ease',
    },
    containerExpanded: {
      transform: 'translateX(256px)',
    },
    titleArea: {
      position: 'absolute',
      top: 20,
      left: 50,
      right: 50,
      textAlign: 'center',
      color: palette.chromeMuted,
    },
    reader: {
      position: 'absolute',
      top: 50,
      left: 50,
      bottom: 20,
      right: 50,
    },
    swipeWrapper: {
      position: 'absolute',
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
      zIndex: 200,
    },
    prev: { left: 1 },
    next: { right: 1 },
    arrow: {
      outline: 'none',
      border: 'none',
      background: 'none',
      position: 'absolute',
      top: '50%',
      marginTop: -32,
      fontSize: 64,
      padding: '0 10px',
      color: palette.border,
      // Sans-serif, per the brand rules: these arrows are chrome, not text.
      fontFamily: 'system-ui, sans-serif',
      cursor: 'pointer',
      userSelect: 'none',
      appearance: 'none',
      fontWeight: 'normal',
    },
    arrowHover: {
      color: palette.chromeMuted,
    },
    toc: {},
    tocBackground: {
      position: 'absolute',
      left: 256,
      top: 0,
      bottom: 0,
      right: 0,
      zIndex: 1,
    },
    tocArea: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      zIndex: 0,
      width: 256,
      overflowY: 'auto',
      WebkitOverflowScrolling: 'touch',
      background: palette.chrome,
      padding: '10px 0',
    },
    tocAreaButton: {
      userSelect: 'none',
      appearance: 'none',
      background: 'none',
      border: 'none',
      display: 'block',
      fontFamily: 'system-ui, sans-serif',
      width: '100%',
      fontSize: '.9em',
      textAlign: 'left',
      padding: '.9em 1em',
      borderBottom: `1px solid ${palette.border}`,
      color: palette.chromeText,
      boxSizing: 'border-box',
      outline: 'none',
      cursor: 'pointer',
    },
    tocButton: {
      background: 'none',
      border: 'none',
      width: 32,
      height: 32,
      position: 'absolute',
      top: 10,
      left: 10,
      borderRadius: 2,
      outline: 'none',
      cursor: 'pointer',
    },
    tocButtonExpanded: {
      background: palette.chrome,
    },
    tocButtonBar: {
      position: 'absolute',
      width: '60%',
      background: palette.chromeMuted,
      height: 2,
      left: '50%',
      margin: '-1px -30%',
      top: '50%',
      transition: 'all .5s ease',
    },
    tocButtonBarTop: { top: '35%' },
    tocButtonBottom: { top: '66%' },
    loadingView: {
      position: 'absolute',
      top: '50%',
      left: '10%',
      right: '10%',
      color: palette.chromeMuted,
      textAlign: 'center',
      marginTop: '-.5em',
    },
    errorView: {
      position: 'absolute',
      top: '50%',
      left: '10%',
      right: '10%',
      color: '#c00',
      textAlign: 'center',
      marginTop: '-.5em',
    },
  };
}

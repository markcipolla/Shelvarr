/**
 * React testing setup with jsdom
 */

import { JSDOM } from 'jsdom';
import React from 'react';
import ReactDOM from 'react-dom';

// Setup jsdom environment for React testing
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost:3000',
  pretendToBeVisual: true,
});

global.window = dom.window as any;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', {
  value: dom.window.navigator,
  writable: true,
  configurable: true,
});
global.HTMLElement = dom.window.HTMLElement;
global.HTMLInputElement = dom.window.HTMLInputElement;
global.MouseEvent = dom.window.MouseEvent;
global.KeyboardEvent = dom.window.KeyboardEvent;

// Make React available globally
(global as any).React = React;
(global as any).ReactDOM = ReactDOM;

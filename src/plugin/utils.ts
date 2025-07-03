// Utility functions for the State Machine Plugin
/// <reference types="@figma/plugin-typings" />

/**
 * Utility function to extract string value from component property
 */
export function extractPropertyValue(propValue: any): string {
  if (typeof propValue === 'string') {
    return propValue;
  }
  
  if (propValue && typeof propValue === 'object') {
    const objValue = propValue as any;
    if ('value' in objValue) {
      return String(objValue.value);
    }
    if ('name' in objValue) {
      return String(objValue.name);
    }
    return String(propValue);
  }
  
  return String(propValue);
}

/**
 * Send a message to the UI
 */
export function sendMessageToUI(type: string, data?: any, message?: string): void {
  figma.ui.postMessage({ type, data, message });
}

/**
 * Handle errors gracefully and send to UI
 */
export function handleError(error: unknown, context: string): void {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(`${context}:`, error);
  sendMessageToUI('error', null, `${context}: ${message}`);
} 
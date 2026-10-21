import { Shortcuts } from 'ai-researcher';
import { PressKey } from '../fixtures';

/**
 * Справка по горячим клавишам. Компонент не рисует триггер — он слушает `?`
 * на window, поэтому сцена отправляет эту клавишу после монтирования.
 */
export const Opened = () => (
  <PressKey>
    <Shortcuts />
  </PressKey>
);

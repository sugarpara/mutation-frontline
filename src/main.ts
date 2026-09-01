import './styles.css';
import { Game } from './game/Game';

const canvas = document.getElementById('game-canvas');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Game canvas was not found');

const game = new Game(canvas);
game.start();

declare global {
  interface Window {
    mutationFrontline: Game;
  }
}

window.mutationFrontline = game;

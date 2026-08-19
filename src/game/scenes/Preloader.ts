import { Scene } from 'phaser';
import { CHARACTERS, GAME_ASSETS } from '../assets';

export class Preloader extends Scene
{
    constructor ()
    {
        super('Preloader');
    }

    init ()
    {
        this.cameras.main.setBackgroundColor('#142436');
        this.add.text(180, 286, 'SKYLINE HOP', { fontFamily: 'Arial Black', fontSize: 25, color: '#f7f1df' }).setOrigin(0.5);
        this.add.rectangle(180, 330, 184, 8, 0x2b4054);
        const bar = this.add.rectangle(88, 330, 0, 8, 0xff5a73).setOrigin(0, 0.5);

        //  Use the 'progress' event emitted by the LoaderPlugin to update the loading bar
        this.load.on('progress', (progress: number) => {

            //  Update the progress bar (our bar is 464px wide, so 100% = 464px)
            bar.width = 184 * progress;

        });
    }

    preload ()
    {
        //  Load the assets for the game - Replace with your own assets
        this.load.setPath('assets');

        this.load.svg('background-sky', GAME_ASSETS.sky, { width: 360, height: 640 });
        this.load.svg('background-city', GAME_ASSETS.city, { width: 720, height: 640 });
        this.load.svg('background-street', GAME_ASSETS.street, { width: 720, height: 180 });
        this.load.svg('obstacle', GAME_ASSETS.obstacle, { width: 76, height: 480 });
        this.load.svg('reward', GAME_ASSETS.reward, { width: 48, height: 48 });
        CHARACTERS.forEach((character) => this.load.svg(character.textureKey, character.image, { width: 72, height: 72 }));
    }

    create ()
    {
        //  When all the assets have loaded, it's often worth creating global objects here that the rest of the game can use.
        //  For example, you can define global animations here, so we can use them in other scenes.

        //  Move to the MainMenu. You could also swap this for a Scene Transition, such as a camera fade.
        this.scene.start('Game');
    }
}

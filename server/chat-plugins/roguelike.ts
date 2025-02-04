import {FS, Utils} from '../../lib';
const SAVE_DATA = 'config/roguelike.json';
const roguelikeGames = new Map<ID,Roguelike>();

interface AITrainer {
	name: string;
	team?: PokemonSet[];
}

function createAIBattle(user: User, ai?: AITrainer) {
	let aiTrainer = ai ? ai : {name: 'debug', team: ''};
	Rooms.createBattle({
		format: 'gen9roguelikebattle',
		isRoguelikeBattle: true,
		players: [{
			user: user,
			// @ts-ignore
		}, {
			username: aiTrainer.name,
			team: aiTrainer.team,
			isAI: true,
		}],
	});
}

export function roguelikeAI() {
	return 'default';
}

export class Roguelike {
	battle: Number;
	streak: Number;
	team: PokemonSet[];
	teamData: {
		curHP: Number;
		status: String;
		ppLeft: Number[];
		exp: Number;
	}[];
	opponentTeam: PokemonSet[];
	inBattle: boolean;

	constructor(user: User) {
		this.battle = 0;
		this.streak = 0;
		this.team = [];
		this.teamData = [];
		this.opponentTeam = [];
		this.inBattle = false;
	
		roguelikeGames.set(user.id, this);
		this.save();
	}

	save() {
		FS(SAVE_DATA).write(JSON.stringify(roguelikeGames));
	}

	getUserData(user: User) {
		return roguelikeGames.get(user.id) || false;
	}

}

export const commands: Chat.ChatCommands = {

	testcmd(target, room, user) {
		// @ts-ignore
		createAIBattle(user);
	},
};

export const pages: Chat.PageTable = {

};

export const handlers: Chat.Handlers = {
	onBattleStart(user, room) {
		// @ts-ignore
		if (!room.options.isRoguelikeBattle) return;
		console.log(user.id);
	},

	onBattleEnd(battle, winner, players) {
		if (!battle.options.isRoguelikeBattle) return;
		console.log(winner);
	},
};

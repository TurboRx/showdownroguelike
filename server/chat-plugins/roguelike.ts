import {FS, Utils} from '../../lib';
const SAVE_DATA = 'config/roguelike.json';
const roguelikeGames = new Map<ID,Roguelike>();

try {
	const saveDataObj = JSON.parse(FS(SAVE_DATA).readSync());
	for (const key in saveDataObj) {
		roguelikeGames.set(key as ID, saveDataObj[key] as Roguelike);
	}
} catch {
	FS(SAVE_DATA).safeWriteSync(JSON.stringify(roguelikeGames));
}

interface AITrainer {
	name: string;
	team: PokemonSet[];
}

function saveRoguelikeData() {
	FS(SAVE_DATA).writeUpdate(() => JSON.stringify(Object.fromEntries(roguelikeGames)));
}

function getUserRoguelikeData(userID: ID) {
	return roguelikeGames.get(userID) || false;
}

function createAIBattle(userID: ID, ai: AITrainer) {
	let user = Users.get(userID);
	if (!user) return;
	Rooms.createBattle({
		format: 'gen9roguelikebattle',
		isRoguelikeBattle: true,
		players: [{
			user: user,
			// @ts-ignore
		}, {
			username: ai.name,
			team: Teams.pack(ai.team) || '',
			isAI: true,
		}],
	});
}

export function roguelikeAI() {
	return 'default';
}

export class Roguelike {
	user: ID;
	battle: number;
	streak: number;
	cash: number;
	team: PokemonSet[];
	teamData: {
		curHP: number;
		status: String;
		ppLeft: number[];
		exp: number;
	}[];
	opponentTeam: PokemonSet[];
	inBattle: boolean;

	constructor(user: User) {
		this.user = user.id;
		this.battle = 1;
		this.streak = 0;
		this.cash = 10;
		this.team = [];
		this.teamData = [];
		this.opponentTeam = [];
		this.inBattle = false;

		roguelikeGames.set(user.id, this);
		saveRoguelikeData();
	}

	win() {
		if (this.battle % 7 === 0) this.streak++;
		this.battle++;
		saveRoguelikeData();
		this.refreshPage();
		let newFoe = this.createAITrainer();
		createAIBattle(this.user, newFoe);
	}

	lose() {
		this.battle = 1;
		this.streak = 0;
	}
	createAITrainer() {
		// TODO: name generation
		const ai = {} as AITrainer;
		ai.name = 'debug';
		ai.team = this.opponentTeam;
		return ai;
	}
	refreshPage() {
		let realUser = Users.get(this.user);
		if (realUser) {
			Chat.parse(`/join view-roguelike`, null, realUser, realUser.connections[0]);
		}
	}
}

export const commands: Chat.ChatCommands = {
	uwu(target, room, user) {
		let userData = new Roguelike(user);
		let newFoe = userData.createAITrainer();
		createAIBattle(userData.user, newFoe);
		return this.parse(`/join view-roguelike`);
	},
};

export const pages: Chat.PageTable = {
	async roguelike(args, user) {
		if (!user.named) return Rooms.RETRY_AFTER_LOGIN;
		let userGameData = getUserRoguelikeData(user.id);
		if (!userGameData) return Rooms.RETRY_AFTER_LOGIN;
		return `Current Match: ${userGameData.battle}<br />Streaks Won: ${userGameData.streak}`;
	},
};

export const handlers: Chat.Handlers = {
	// onBattleStart(user, room) {
	// 	// @ts-ignore
	// 	if (!room.options.isRoguelikeBattle) return;
	// 	console.log(user.id);
	// },

	onBattleEnd(battle, winner, players) {
		if (!battle.options.isRoguelikeBattle) return;
		// Player 1 is the always the human
		let human = players[0];
		let humanGameData = getUserRoguelikeData(human);
		if (!humanGameData) return;
		if (human === winner) {
			humanGameData.win();
		} else {
			humanGameData.lose();
		}
	},
};

import {FS, Utils} from '../../lib';
const SAVE_DATA = 'config/roguelike.json';
const roguelikeGames = new Map<ID,Roguelike>();

interface AITrainer {
	name: string;
	team: PokemonSet[];
}

interface BackupData {
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
	flags: {
		[k: string]: any;
	}
	opponentTeam: PokemonSet[];
	inBattle: boolean; // Should always be false
	runEnded: boolean;
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
	flags: {
		[k: string]: any;
	}
	opponentTeam: PokemonSet[];
	inBattle: boolean;
	runEnded: boolean;

	constructor(userID: ID, backup?: BackupData) {
		this.user = userID;
		this.battle = backup?.battle || 1;
		this.streak = backup?.streak || 0;
		this.cash = backup?.cash || 10;
		this.team = backup?.team || [];
		this.teamData = backup?.teamData || [];
		this.flags = backup?.flags || [];
		this.opponentTeam = backup?.opponentTeam || [];
		this.inBattle = false;
		this.runEnded = backup?.runEnded || false;
	}

	win() {
		if (this.battle % 7 === 0) this.streak++;
		this.battle++;
		this.refreshPage();
		let newFoe = this.createAITrainer();
		createAIBattle(this.user, newFoe);
	}

	lose() {
		this.runEnded = true;
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

function createSaveData(user: User) {
	const rl = new Roguelike(user.id);
	roguelikeGames.set(user.id, rl);
	saveRoguelikeData();
	return rl;
}

function convertJSONData(key: ID, backup: BackupData) {
	const rl = new Roguelike(key, backup);
	return rl;
}

try {
	const saveDataObj = JSON.parse(FS(SAVE_DATA).readSync());
	for (const key in saveDataObj) {
		const newData = convertJSONData(key as ID, saveDataObj[key] as BackupData);
		roguelikeGames.set(key as ID, newData);
	}
} catch (e) {
	console.log(e);
	FS(SAVE_DATA).safeWriteSync(JSON.stringify(roguelikeGames));
}

export const commands: Chat.ChatCommands = {
	uwu(target, room, user) {
		let userData = getUserRoguelikeData(user.id);
		if (!userData || userData.runEnded) {
			userData = createSaveData(user);
		}
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
	onBattleStart(user, room) {
		if (room.battle?.options.isRoguelikeBattle && user) {
			const roguelikePlayer = getUserRoguelikeData(user.id);
			if (roguelikePlayer) roguelikePlayer.inBattle = true;
		}
	},

	onBattleEnd(battle, winner, players) {
		if (!battle.options.isRoguelikeBattle) return;
		// Player 1 is the always the human
		let human = players[0];
		let humanGameData = getUserRoguelikeData(human);
		if (!humanGameData) return;
		humanGameData.inBattle = false;
		if (human === winner) {
			humanGameData.win();
		} else {
			humanGameData.lose();
		}
		saveRoguelikeData();
	},
};

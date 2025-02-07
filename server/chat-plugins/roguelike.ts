import {FS/* , Utils*/} from '../../lib';
const SAVE_DATA = 'config/roguelike.json';
const roguelikeGames = new Map<ID, Roguelike>();

interface ShopItem {
	name: string;
	type: 'pokemon' | 'healHP' | 'healPP' | 'TM' | 'key' | 'scout' | 'debug';
	desc: string;
	cost: number;
	minStreak: number;
}

const SHOP_ITEMS: {[k: string]: ShopItem} = {
	debug: {name: 'Debug', type: 'debug', desc: 'Bans HoeenHero from this server.', cost: 1, minStreak: 0},
	debug2: {name: 'Debug 2', type: 'debug', desc: 'Bans HoeenHero from this server twice.', cost: 999, minStreak: 1},
};

interface AITrainer {
	name: string;
	team: PokemonSet[];
}

interface BackupData {
	user: ID;
	battle: number;
	streak: number;
	battlePoints: number;
	team: PokemonSet[];
	teamData: {
		curHP: number,
		status: string,
		ppLeft: number[],
		exp: number,
	}[];
	flags: {
		[k: string]: any,
	};
	opponentTeam: PokemonSet[];
	inBattle: boolean; // Should always be false
	runEnded: boolean;
}

function createAIBattle(userID: ID, ai: AITrainer) {
	const user = Users.get(userID);
	if (!user) return;
	Rooms.createBattle({
		format: 'gen9roguelikebattle',
		isRoguelikeBattle: true,
		players: [{
			user: user,
			// @ts-ignore AI has no user data
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
	battlePoints: number;
	team: PokemonSet[];
	teamData: {
		curHP: number,
		status: string,
		ppLeft: number[],
		exp: number,
	}[];
	flags: {
		[k: string]: any,
	};
	opponentTeam: PokemonSet[];
	inBattle: boolean;
	runEnded: boolean;

	constructor(userID: ID, backup?: BackupData) {
		this.user = userID;
		this.battle = backup?.battle || 1;
		this.streak = backup?.streak || 0;
		this.battlePoints = backup?.battlePoints || 10;
		this.team = backup?.team || [];
		this.teamData = backup?.teamData || [];
		this.flags = backup?.flags || [];
		this.opponentTeam = backup?.opponentTeam || [];
		this.inBattle = false;
		this.runEnded = backup?.runEnded || false;
	}

	win() {
		if (this.battle % 7 === 0) {
			this.streak++;
		}
		this.battle++;
		this.refreshPage();
		const newFoe = this.createAITrainer();
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
		const realUser = Users.get(this.user);
		if (realUser) {
			Chat.parse(`/join view-roguelike`, null, realUser, realUser.connections[0]);
		}
	}
	genShopHTML() {
		let buf = `<center><h3>SHOP</h3></center><br />`;
		buf += `<table style="width:100%; border-collapse: collapse;"border="1"><tr><th>Item</th><th>Description</th><th>Price</th></tr>`;
		for (const key in SHOP_ITEMS) {
			const item = SHOP_ITEMS[key];
			if (item.minStreak > this.streak) continue;
			buf += `<tr><td>${item.name}</td><td>${item.desc}</td><td>${item.cost} BP</td>`;
			if (item.cost > this.battlePoints) {
				buf += `<td><button class="button disabled">Not enough BP!</button>`;
			} else {
				buf += `<td><button class="button">Purchase</button>`;
			}
			buf += `</tr>`;
		}
		buf += `</table>`;
		return buf;
	}
}

function saveRoguelikeData() {
	FS(SAVE_DATA).writeUpdate(() => JSON.stringify(Object.fromEntries(roguelikeGames)));
}

function getUserRoguelikeData(userID: ID) {
	return roguelikeGames.get(userID) || false;
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
} catch {
	FS(SAVE_DATA).safeWriteSync(JSON.stringify(roguelikeGames));
}

export const commands: Chat.ChatCommands = {
	uwu(target, room, user) {
		let userData = getUserRoguelikeData(user.id);
		if (!userData || userData.runEnded) {
			userData = createSaveData(user);
		}
		const newFoe = userData.createAITrainer();
		createAIBattle(userData.user, newFoe);
		return this.parse(`/join view-roguelike`);
	},
};

export const pages: Chat.PageTable = {
	roguelike(args, user) {
		const userGameData = getUserRoguelikeData(user.id);
		if (!userGameData || !user.named) return Rooms.RETRY_AFTER_LOGIN;
		this.title = '[Roguelike] Current Run Info';
		let buf = `<div class = "pad">`;
		buf += `<b>Current Match:</b> ${userGameData.battle} | <b>Streaks Won:</b> ${userGameData.streak} | <b>BP:</b> ${userGameData.battlePoints}<hr>`;
		buf += userGameData.genShopHTML();
		buf += `</div>`;
		return buf;
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
		const human = players[0];
		const humanGameData = getUserRoguelikeData(human);
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

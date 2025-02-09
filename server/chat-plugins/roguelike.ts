/**
* HiZo's Untitled Roguelike
* @author HiZo
*/

import {FS, Utils} from '../../lib';
import {TeamValidator} from '../../sim/team-validator';
const SAVE_DATA = 'config/roguelike.json';
const roguelikeGames = new Map<ID, Roguelike>();

type Phase = 'battle' | 'results' | 'shop' | 'purchase' | 'intro' | 'scout' | 'other' | 'battleError';

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
	gamePhase: Phase;
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

function genPokemon(quantity: number, level: number | number[], starter?: boolean) {
	let minLevel;
	let maxLevel;
	if (typeof level === 'number') {
		minLevel = level;
		maxLevel = level;
	} else {
		minLevel = level[0];
		maxLevel = level[1] ? level[1] : level[0];
	}
	const validate = new TeamValidator('gen9roguelikebattle');
	const gennedMons: PokemonSet[] = [];
	const all = Dex.species.all().filter(s => !s.battleOnly && !s.requiredItems && s.forme !== 'Gmax' && !s.isNonstandard);
	if (starter) {
		all.filter(s => !s.prevo);
	}
	let depth = 0;
	while (gennedMons.length < quantity) {
		const specie = Utils.shuffle(all).shift();
		if (!specie) {
			throw new Error('Somehow there is no Pokemon');
		}
		let setAbil;
		if (specie.abilities.S && Math.floor(Math.random() * 100) === 1) {
			setAbil = specie.abilities.S;
		} else if (specie.abilities.H && Math.floor(Math.random() * 50) === 1) {
			setAbil = specie.abilities.H;
		} else {
			if (specie.abilities[1] && Math.floor(Math.random() * 2) === 1) {
				setAbil = specie.abilities[1];
			} else {
				setAbil = specie.abilities[0];
			}
		}
		const natures: string[] = [];
		Dex.natures.all().forEach(n => natures.push(n.name));
		const set: PokemonSet = {
			name: specie.baseSpecies,
			species: specie.name,
			gender: specie.gender || Utils.randomElement(['M', 'F']),
			shiny: (Math.floor(Math.random() * 1024) === 69),
			item: '',
			ability: setAbil,
			moves: [],
			nature: Utils.randomElement(natures),
			evs: {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0},
			// eslint-disable-next-line max-len
			ivs: {hp: Math.floor(Math.random() * 32), atk: Math.floor(Math.random() * 32), def: Math.floor(Math.random() * 32), spa: Math.floor(Math.random() * 32), spd: Math.floor(Math.random() * 32), spe: Math.floor(Math.random() * 32)},
			level: minLevel,
		};
		if (depth >= 999999999999) {
			set.level = Math.floor(Math.random() * (maxLevel - minLevel)) + minLevel;
			gennedMons.push(set);
		} else {
			for (let curLevel = minLevel; curLevel <= maxLevel; curLevel++) {
				// what the fuck
				if (!validate.validateTeam([set])?.some(err => err.includes('must be at least level'))) {
					gennedMons.push(set);
					break;
				}
				set.level++;
			}
		}
		depth++;
	}
	for (const moveless of gennedMons) {
		let viableMoves: string[] = [];
		const fullLearn = Dex.species.getFullLearnset(toID(moveless.species));
		for (const learnsetIndex of fullLearn) {
			const learnset = learnsetIndex.learnset;
			for (const move in learnset) {
				// console.log(learnset[move]);
				// console.log('9L1'.endsWith('L1'));
				for (let lvl = 1; lvl < moveless.level; lvl++) {
					if (learnset[move].some(source => source.substring(1) === `L${lvl}`)) {
						if (!viableMoves.includes(move)) viableMoves.push(move);
					}
				}
			}
		}
		if (!viableMoves.length) {
			throw new Error(`${moveless.species} somehow has no moves at level ${moveless.level}!`);
		}
		viableMoves = Utils.shuffle(viableMoves);
		for (let x = 0; x < Utils.clampIntRange(viableMoves.length, 1, 4); x++) {
			const m = Dex.moves.get(viableMoves[x]).name;
			if (m) moveless.moves.push(m);
		}
	}
	console.log(gennedMons);
	return gennedMons;
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
	gamePhase: Phase;
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
		this.gamePhase = backup?.gamePhase || 'intro';
		this.runEnded = backup?.runEnded || false;
	}

	win() {
		if (this.battle % 7 === 0) {
			this.streak++;
		}
		this.battle++;
		// this.refreshPage();
		// const newFoe = this.createAITrainer();
		// createAIBattle(this.user, newFoe);
	}

	lose() {
		this.runEnded = true;
	}
	goToPhase(direction: Phase) {
		if (this.flags.purchasedItem && this.gamePhase === 'purchase') {
			// Sorry, no refunds
			delete this.flags.purchasedItem;
		}
		this.gamePhase = direction;
		this.refreshPage();
		if (direction !== 'battle') {
			saveRoguelikeData();
		}
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
				buf += `<td><button class="button" name="send" value="/roguelike buy ${key}">Purchase</button>`;
			}
			buf += `</tr>`;
		}
		buf += `</table>`;
		return buf;
	}
	genPurchaseHTML(failure?: boolean) {
		let buf = ``;
		const exitButtonText = 'Leave and go back to shop.';
		switch ((this.flags.purchasedItem as ShopItem)?.type) {
		case 'pokemon':
			break;
		case 'healHP':
			break;
		case 'healPP':
			break;
		case 'TM':
			break;
		case 'key':
			break;
		case 'scout':
			break;
		case 'debug':
			buf += 'Hoeen is now banned from this server.<br />Good job!';
			break;
		default:
			buf += 'Something went wrong, contact HiZo.';
			break;
		}
		buf += `<br /><button class="button" name="send" value="/roguelike shop">${exitButtonText}</button>`;
		return buf;
	}
}

function saveRoguelikeData() {
	const JSONobj = Object.fromEntries(roguelikeGames);
	for (const player in JSONobj) {
		const playerData = JSONobj[player];
		if (playerData.gamePhase === 'battle') {
			// in case of a restart, battles might get lost
			// and players might get softlocked, so this
			// state can help players restart their battles
			playerData.gamePhase = 'battleError';
		}
	}
	FS(SAVE_DATA).writeUpdate(() => JSON.stringify(JSONobj));
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
		return Teams.export(genPokemon(3, 5, true));
	},
	roguelike: {
		start(target, room, user) {
			// TODO: Refactor this
			let userData = getUserRoguelikeData(user.id);
			if (!userData || userData.runEnded) {
				userData = createSaveData(user);
			}
			const newFoe = userData.createAITrainer();
			createAIBattle(userData.user, newFoe);
			return this.parse(`/join view-roguelike`);
		},
		shop(target, room, user) {
			const userData = getUserRoguelikeData(user.id);
			if (!userData) return this.errorReply(`No data found.`);
			if (userData.gamePhase !== 'results' &&
				userData.gamePhase !== 'purchase') return this.errorReply(`Can't go to shop yet!`);
			userData.goToPhase('shop');
		},
		buy(target, room, user) {
			const userData = getUserRoguelikeData(user.id);
			if (!userData) return this.errorReply(`No data found.`);
			if (userData.gamePhase !== 'shop') return this.errorReply(`Can't buy stuff yet!`);
			const item = SHOP_ITEMS[target] || false;
			if (!item) return this.errorReply('Does that item even exist?');
			if (item.cost > userData.battlePoints) return this.popupReply(`You don't have enough BP to buy this!`);
			// Check if item is useable
			// if (false) {
			// 	return this.popupReply(`You don't need this right now!`);
			// }
			userData.flags.purchasedItem = item;
			userData.battlePoints -= item.cost;
			userData.goToPhase('purchase');
		},
		next(target, room, user) {
			const userData = getUserRoguelikeData(user.id);
			if (!userData) return this.errorReply(`No data found.`);
			if (userData.gamePhase !== 'shop') return this.errorReply(`Can't battle yet!`);
			const newFoe = userData.createAITrainer();
			createAIBattle(userData.user, newFoe);
		},
	},
};

export const pages: Chat.PageTable = {
	roguelike(args, user) {
		const userGameData = getUserRoguelikeData(user.id);
		if (!userGameData || !user.named) return Rooms.RETRY_AFTER_LOGIN;
		let subtitle = '';
		let buf = `<div class = "pad">`;
		switch (userGameData.gamePhase) {
		case 'battle':
			this.title = '[Roguelike] Currently in battle';
			return this.errorReply('You are currently in battle!');
		case 'results':
			if (userGameData.runEnded) {
				subtitle = 'Game Over';
				buf += `<center><h3>Too bad!</h3><br />`;
				buf += `<b>Matches won:</b> ${userGameData.battle - 1}<br /><b>Streaks Won:</b> ${userGameData.streak}<br /><b>BP:</b> ${userGameData.battlePoints}`;
				buf += `<br /><button class="button" name="send" value="/roguelike start">Start a new run</button></center>`;
			} else {
				subtitle = 'Current Run Info';
				buf += `<center><h3>Nice win!</h3><br />`;
				buf += `<b>Current match:</b> ${userGameData.battle}<br /><b>Streaks won:</b> ${userGameData.streak}<br /><b>BP:</b> ${userGameData.battlePoints}`;
				buf += `<br /><button class="button" name="send" value="/roguelike shop">Go to shop</button></center>`;
			}
			break;
		case 'scout':
		case 'shop':
			subtitle = 'Shop';
			buf += `<b>BP:</b> ${userGameData.battlePoints}<br />`;
			buf += userGameData.genShopHTML();
			buf += `<br /><button class="button" name="send" value="/roguelike next">Start the next battle!</button>`;
			break;
		case 'purchase':
			if (!userGameData.flags.purchasedItem) {
				this.title = '[Roguelike] Purchase Error';
				return this.errorReply('If you tried to purchased something and reached this error, contact HiZo.');
			}
			subtitle = 'Complete Purchase';
			// TODO: Be able to buy things
			buf += userGameData.genPurchaseHTML();
			break;
		case 'intro':
			subtitle = 'Pick a Starter';
			// TODO: Be able to add Pokemon
			break;
		case 'other':
			// TODO: ????
			break;
		case 'battleError':
			subtitle = 'Error';
			break;
		}
		buf += `</div>`;
		this.title = '[Roguelike]' + subtitle;
		return buf;
	},
};

export const handlers: Chat.Handlers = {
	onBattleStart(user, room) {
		if (room.battle?.options.isRoguelikeBattle && user) {
			const roguelikePlayer = getUserRoguelikeData(user.id);
			if (roguelikePlayer) roguelikePlayer.goToPhase('battle');
		}
	},

	onBattleEnd(battle, winner, players) {
		if (!battle.options.isRoguelikeBattle) return;
		// Player 1 is the always the human
		const human = players[0];
		const humanGameData = getUserRoguelikeData(human);
		if (!humanGameData) return;
		if (human === winner) {
			humanGameData.win();
		} else {
			humanGameData.lose();
		}
		humanGameData.goToPhase('results');
	},
};

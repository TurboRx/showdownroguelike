/**
* HiZo's Untitled Roguelike
* @author HiZo
*/

import {FS, Utils} from '../../lib';
import {TeamValidator} from '../../sim/team-validator';
const SAVE_DATA = 'config/roguelike.json';
const roguelikeGames = new Map<ID, Roguelike>();

const SEQUENCE_CHECK: {[k: string]: string[]} = {
	battle: ['results'],
	results: ['shop'],
	shop: ['battle', 'purchase'],
	purchase: ['shop'],
};

interface ShopItem {
	name: string;
	icon: string;
	type: 'pokemon' | 'healHP' | 'healPP' | 'TM' | 'key' | 'scout' | 'debug';
	desc: string;
	cost: number;
	minStreak: number;
}

const SHOP_ITEMS: {[k: string]: ShopItem} = {
	debug: {name: 'Debug', icon: 'berserk gene', type: 'debug', desc: 'Bans HoeenHero from this server.', cost: 1, minStreak: 0},
	debug2: {name: 'Debug 2', icon: 'berserk gene', type: 'debug', desc: 'Bans HoeenHero from this server twice.', cost: 999, minStreak: 1},
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
	curRoom: string;
	runEnded: boolean;
}

function createAIBattle(userID: ID, ai: AITrainer) {
	const user = Users.get(userID);
	const gameData = roguelikeGames.get(userID);
	if (!user || !gameData) return;
	console.log(gameData.teamData);
	Rooms.createBattle({
		format: 'gen9roguelikebattle',
		isRoguelikeBattle: true,
		players: [{
			user: user,
			team: Teams.pack(gameData.team) || '',
			roguelikeTeamData: gameData.teamData,
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
	// eslint-disable-next-line max-len
	let all = Dex.species.all().filter(s => !s.battleOnly && !s.requiredItems && s.forme !== 'Gmax' && !(s.isNonstandard && s.isNonstandard !== 'Past'));
	if (starter) {
		all = all.filter(s => !s.prevo);
		// eslint-disable-next-line max-len
		all = all.filter(s => !(s.tags.includes('Mythical') || s.tags.includes('Restricted Legendary') || s.tags.includes('Sub-Legendary')));
		// eslint-disable-next-line max-len
		all = all.filter(s => !(s.tags.includes('Paradox') || ['Gouging Fire', 'Raging Bolt', 'Iron Crown', 'Iron Boulder'].includes(s.baseSpecies)));
		all = all.filter(s => !s.tags.includes('Ultra Beast') || s.name === 'Poipole');
		all = all.filter(s => !['Ursaluna-Bloodmoon', 'Floette-Eternal'].includes(s.name));
	}
	let depth = 0;
	while (gennedMons.length < quantity) {
		const specie = Utils.shuffle(all).shift();
		if (!specie) {
			throw new Error('Somehow there is no Pokemon');
		}
		let setAbil;
		// TODO: Assess the Pupitar problem
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
		if (depth > 500) {
			set.level = Math.floor(Math.random() * (maxLevel - minLevel)) + minLevel;
			gennedMons.push(set);
		} else {
			for (let curLevel = minLevel; curLevel <= maxLevel; curLevel++) {
				// what the fuck
				if (!validate.validateTeam([set])?.some(err => err.includes('must be at least level'))) {
					if (Math.floor(Math.random() * (maxLevel - curLevel)) === 0) gennedMons.push(set);
					break;
				}
				set.level++;
			}
		}
		all = all.filter(s => !(s.baseSpecies === specie.baseSpecies));
		depth++;
	}
	// TODO: Refactor this to own function for TMs
	for (const moveless of gennedMons) {
		let viableMoves: string[] = [];
		const fullLearn = Dex.species.getFullLearnset(toID(moveless.species));
		for (const learnsetIndex of fullLearn) {
			const learnset = learnsetIndex.learnset;
			for (let lvl = 1; lvl <= moveless.level; lvl++) {
				const movesAtlevel: string[] = [];
				for (const move in learnset) {
					if (learnset[move].some(source => source.substring(1) === `L${lvl}`)) {
						if (!viableMoves.includes(move) && !movesAtlevel.includes(move)) {
							movesAtlevel.push(move);
						}
					}
				}
				// randomize moves at equal level
				Utils.shuffle(movesAtlevel);
				viableMoves = viableMoves.concat(movesAtlevel);
			}
		}
		if (!viableMoves.length) {
			throw new Error(`${moveless.species} somehow has no moves at level ${moveless.level}!`);
		}
		viableMoves = viableMoves.reverse();
		for (let x = 0; x < Utils.clampIntRange(viableMoves.length, 1, 4); x++) {
			const m = Dex.moves.get(viableMoves[x]).name;
			if (m) moveless.moves.push(m);
		}
		moveless.moves.reverse();
	}
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
		status: string | false,
		ppLeft: number[],
		exp: number,
	}[];
	flags: {
		pokemonOptions?: PokemonSet[],
		[k: string]: any,
	};
	opponentTeam: PokemonSet[];
	curRoom: string;
	runEnded: boolean;
	inBattle: boolean;

	constructor(userID: ID, backup?: BackupData) {
		this.user = userID;
		this.battle = backup?.battle || 1;
		this.streak = backup?.streak || 0;
		this.battlePoints = backup?.battlePoints || 5;
		this.team = backup?.team || [];
		this.teamData = backup?.teamData || [];
		this.flags = backup?.flags || [];
		this.opponentTeam = backup?.opponentTeam || [];
		this.curRoom = backup?.curRoom || 'intro';
		this.runEnded = backup?.runEnded || false;
		this.inBattle = false;
	}

	win() {
		const RECOMMENDED_TEAM_LENGTH = [2, 3, 3, 4, 4, 5, 6];
		let scale = [5, 10];
		if (this.battle % 7 === 0) {
			this.streak++;
		}
		this.battle++;
		this.battlePoints += 5;
		scale.forEach((e, i) => scale[i] = Utils.clampIntRange(e + (this.streak * 5), 1, 100));
		const num = RECOMMENDED_TEAM_LENGTH[Utils.clampIntRange(this.streak, 0, 6)];
		this.opponentTeam = genPokemon(num, scale);
	}

	lose() {
		this.runEnded = true;
	}

	addPokemon(pokemon: PokemonSet, index?: number) {
		if (index) {
			// TODO: RELEASING POKEMON
		} else {
			let newHpData;
			this.team.push(pokemon);
			const species = Dex.species.get(pokemon.species);
			if (species.maxHP) {
				newHpData = species.maxHP;
			} else {
				const hpStat = species.baseStats.hp;
				newHpData = Math.floor(((pokemon.ivs.hp + (2 * hpStat) + Math.floor(pokemon.evs.hp / 4) + 100) * pokemon.level) / 100) + 10;
			}
			let ppArr = [];
			for (const move of pokemon.moves) {
				const movePP = Dex.moves.get(move).pp * (8/5);
				ppArr.push(movePP);
			}
			this.teamData.push({
				curHP: newHpData,
				status: false,
				ppLeft: ppArr,
				exp: 0,
			});
		}
	}

	createAITrainer() {
		// TODO: name generation
		const ai = {} as AITrainer;
		ai.name = 'Roguelike Trainer';
		ai.team = this.opponentTeam;
		return ai;
	}

	refreshPage() {
		const realUser = Users.get(this.user);
		if (realUser) {
			for (const conn of realUser.connections) {
				void Chat.parse(`/join view-roguelike`, null, realUser, conn);
			}
		}
	}

	goToPage(target: string) {
		this.curRoom = target;
		this.refreshPage();
		saveRoguelikeData();
	}

	genShopHTML() {
		let buf = `<center><h3>SHOP</h3></center><br />`;
		buf += `<table style="width:100%; border-collapse: collapse;"border="1"><tr><th>Item</th><th>Description</th><th>Price</th></tr>`;
		for (const key in SHOP_ITEMS) {
			const item = SHOP_ITEMS[key];
			if (item.minStreak > this.streak) continue;
			buf += `<tr><td><psicon item ="${item.icon}"> ${item.name}</td><td>${item.desc}</td><td>${item.cost} BP</td>`;
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
	const JSONobj = Object.create(null);
	roguelikeGames.forEach((value, key) => {
		const okey = key as string;
		JSONobj[okey] = {};
		for (const prop in value) {
			if (prop === 'flags') {
				JSONobj[okey][prop] = {};
				for (const deepProp in value[prop]) {
					JSONobj[okey][prop][deepProp] = value[prop][deepProp];
				}
			} else {
				// @ts-ignore
				JSONobj[okey][prop] = value[prop];
			}
		}
	});
	// for (const player in JSONobj) {
	// 	const playerData = JSONobj[player];
	// 	if (playerData.curRoom === 'battle') {
	// 		// in case of a restart, battles might get lost
	// 		// and players might get softlocked, so this
	// 		// state can help players restart their battles
	// 		playerData.curRoom = 'battleError';
	// 	}
	// }
	FS(SAVE_DATA).writeUpdate(() => JSON.stringify(JSONobj));
}

function createSaveData(user: User) {
	const rl = new Roguelike(user.id);
	// Gen starters here
	rl.flags.pokemonOptions = genPokemon(3, 5, true);
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
		if (!roguelikeGames.get(key as ID)) {
			const newData = convertJSONData(key as ID, saveDataObj[key] as BackupData);
			roguelikeGames.set(key as ID, newData);
		}
	}
} catch {
	FS(SAVE_DATA).safeWriteSync(JSON.stringify(roguelikeGames));
}

function checkSequence(before: string, after: string) {
	const currentMainRoom = before.split('-')[0];
	const targetMainRoom = after.split('-')[0];
	if (SEQUENCE_CHECK[currentMainRoom].includes(after)) return true;
	if (currentMainRoom === targetMainRoom) return true;
	return false;
}

export const commands: Chat.ChatCommands = {
	uwu(target, room, user) {
		return Teams.export(genPokemon(3, [5, 10]));
	},
	game: 'roguelike',
	roguelike: {
		start(target, room, user) {
			createSaveData(user);
			// const newFoe = userData.createAITrainer();
			// createAIBattle(userData.user, newFoe);
			return this.parse(`/join view-roguelike`);
		},
		shop(target, room, user) {
			const userData = roguelikeGames.get(user.id);
			if (!userData || userData.runEnded) return this.errorReply(`You need to make a new run first.`);
			if (!checkSequence(userData.curRoom, 'shop')) return this.errorReply(`Can't go to shop yet!`);
			if (userData.flags.purchasedItem) delete userData.flags.purchasedItem;
			userData.goToPage('shop');
		},
		buy(target, room, user) {
			const userData = roguelikeGames.get(user.id);
			if (!userData || userData.runEnded) return this.errorReply(`You need to make a new run first.`);
			if (userData.curRoom !== 'shop') return this.errorReply(`Can't buy stuff yet!`);
			const item = SHOP_ITEMS[target] || false;
			if (!item) return this.errorReply('Does that item even exist?');
			if (item.cost > userData.battlePoints) return this.popupReply(`You don't have enough BP to buy this!`);
			// Check if item is useable
			// if (false) {
			// 	return this.popupReply(`You don't need this right now!`);
			// }
			userData.flags.purchasedItem = item;
			userData.battlePoints -= item.cost;
			userData.goToPage('purchase');
		},
		addstarter(target, room, user) {
			const userData = roguelikeGames.get(user.id);
			if (!userData || userData.runEnded) return this.errorReply(`You need to make a new run first.`);
			if (!userData.flags.pokemonOptions) return this.errorReply(`No Pokemon to add.`);
			if (userData.curRoom !== 'intro') return this.errorReply(`You already have a starter.`);
			const pokes = userData.flags.pokemonOptions;
			const poke = pokes.find(p => toID(p.species) === toID(target));
			if (!poke) return this.errorReply(`You can't choose that pokemon.`);
			if (userData.team.length > 6) {
				// TODO: Figure out releasing pokemon.
			} else {
				userData.addPokemon(poke);
			}
			delete userData.flags.pokemonOptions;
			userData.opponentTeam = genPokemon(1, 5, true);
			const newFoe = userData.createAITrainer();
			createAIBattle(userData.user, newFoe);
		},
		addpoke(target, room, user) {
			const userData = roguelikeGames.get(user.id);
			if (!userData || userData.runEnded) return this.errorReply(`You need to make a new run first.`);
			if (!userData.flags.pokemonOptions) return this.errorReply(`No Pokemon to add.`);
			const pokes = userData.flags.pokemonOptions;
			const poke = pokes.find(p => toID(p.species) === toID(target));
			if (!poke) return this.errorReply(`You can't choose that pokemon.`);
			if (userData.team.length > 6) {
				// TODO: Figure out releasing pokemon.
			} else {

			}
			delete userData.flags.pokemonOptions;
			userData.goToPage('shop');
		},
		next(target, room, user) {
			const userData = roguelikeGames.get(user.id);
			if (!userData || userData.runEnded) return this.errorReply(`You need to make a new run first.`);
			if (userData.curRoom !== 'shop') return this.errorReply(`Can't battle yet!`);
			const newFoe = userData.createAITrainer();
			createAIBattle(userData.user, newFoe);
		},
	},
};

export const pages: Chat.PageTable = {
	roguelike(args, user) {
		const userGameData = roguelikeGames.get(user.id);
		if (!userGameData || !user.named) return Rooms.RETRY_AFTER_LOGIN;
		const gameArgs = userGameData.curRoom.split('-');
		const mainRoomArg = gameArgs.shift();
		let subtitle = '';
		let buf = `<div class = "pad">`;
		switch (mainRoomArg) {
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
			if (!userGameData.flags.pokemonOptions) {
				this.title = '[Roguelike] Error';
				return this.errorReply('If you reached this error, you either already picked a starter or should contact HiZo.');
			}
			buf += `<center><h3>Choose a starter!</h3><br />`;
			buf += `<div style="width:100%;">`;
			for (const poke of userGameData.flags.pokemonOptions) {
				buf += `<button class="button" name="send" value="/roguelike addstarter ${toID(poke.species)}"><img src="https://play.pokemonshowdown.com/sprites/gen5/${Dex.species.get(poke.species).spriteid}.png" /></button>`;
			}
			buf += `</div>`;
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
			const roguelikePlayer = roguelikeGames.get(user.id);
			if (roguelikePlayer) {
				roguelikePlayer.goToPage('battle');
				roguelikePlayer.inBattle = true;
			}
		}
	},

	onBattleEnd(battle, winner, players) {
		if (!battle.options.isRoguelikeBattle) return;
		console.log(battle)
		// Player 1 is the always the human
		const human = players[0];
		const humanGameData = roguelikeGames.get(human);
		if (!humanGameData) return;
		humanGameData.inBattle = false;
		if (human === winner) {
			humanGameData.win();
		} else {
			humanGameData.lose();
		}
		humanGameData.goToPage('results');
	},
};

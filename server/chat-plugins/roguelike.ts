/**
* HiZo's Untitled Roguelike
* @author HiZo
*/

import { FS, Utils } from '../../lib';
import { TeamValidator } from '../../sim/team-validator';
const SAVE_DATA = 'config/roguelike.json';
const roguelikeGames = new Map<ID, Roguelike>();

export const EXP_TABLE = JSON.parse(FS('data/roguelike/exp.json').readSync());

function getMinExpForMonAtLevel(species: string, level: number) {
	const nextlevel = level + 1;
	species = toID(species);
	const speciesData = EXP_TABLE[species] || EXP_TABLE[toID(Dex.species.get(species).baseSpecies)];
	if (level === 1) return 0;
	switch (speciesData['expType']) {
	case 'Erratic':
		if (level < 50) {
			return Math.floor((level ** 3 * (100 - level)) / 50);
		} else if (level < 68) {
			return Math.floor((level ** 3 * (150 - level)) / 100);
		} if (level < 90) {
			return Math.floor((level ** 3 * ((1911 - (10 * level)) / 3)) / 500);
		} else {
			return Math.floor((level ** 3 * (160 - level)) / 100);
		}
	case 'Fast':
		return Math.floor((4 * level ** 3) / 5);
	case 'Medium Fast':
		return Math.floor(level ** 3);
	case 'Medium Slow':
		const a = (6 / 5) * level ** 3;
		const b = 15 * level ** 2;
		const c = 100 * level;
		return Math.floor(a - b + c - 140);
	case 'Slow':
		return Math.floor((5 * level ** 3) / 4);
	case 'Fluctuating':
		if (level < 15) {
			return Math.floor((level ** 3 * (((level + 1) / 3) + 24)) / 50);
		} else if (level < 36) {
			return Math.floor((level ** 3 * (level + 14)) / 50);
		} else {
			return Math.floor((level ** 3 * ((level / 2) + 32)) / 50);
		}
	}
}

type ItemType = 'pokemon' | 'healHP' | 'healPP' | 'TM' | 'key' | 'scout' | 'debug' | 'revive' | 'cureStatus' | 'item';

const SEQUENCE_CHECK: { [k: string]: string[] } = {
	battle: ['results'],
	results: ['shop'],
	shop: ['battle', 'purchase'],
	purchase: ['shop'],
};

interface ShopItem {
	name: string;
	icon: string;
	type: ItemType;
	desc: string;
	cost: number;
	minStreak: number;
}

interface UserTeamData {
	linkedTeamIndex: number;
	curHP: number;
	status: string | false;
	ppLeft: number[];
	exp: number;
	expAtNextLevel: number;
	maxHP: number;
}

const SHOP_ITEMS: { [k: string]: ShopItem } = {
	pokeballpack: { name: 'Poke Ball Pack', icon: 'Poke Ball', type: 'pokemon', desc: 'Pick 1 of 3 random Pokemon.', cost: 7, minStreak: 0 },
	helditempack: { name: 'Held Item Pack', icon: 'Leftovers', type: 'item', desc: 'Pick 1 of 3 held items to put on a Pokemon', cost: 3, minStreak: 0 },
	maxpotion: { name: 'Max Potion', icon: 'Electirizer', type: 'healHP', desc: 'Heals a pokemon\'s HP fully.', cost: 5, minStreak: 0 },
	maxelixer: { name: 'Max Elixer', icon: 'Magmarizer', type: 'healPP', desc: 'Heals a pokemon\'s moves fully.', cost: 3, minStreak: 0 },
	fullheal: { name: 'Full Heal', icon: 'Flower Sweet', type: 'cureStatus', desc: 'Cures a pokemon\'s status.', cost: 3, minStreak: 0 },
	revive: { name: 'Revive', icon: 'Star Sweet', type: 'revive', desc: 'Revives a Pokemon to half its maximum HP.', cost: 5, minStreak: 1 },
	// debug2: { name: 'Debug 2', icon: 'berserk gene', type: 'debug', desc: 'Bans HoeenHero from this server twice.', cost: 999, minStreak: 1 },
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
	teamData: UserTeamData[];
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
	Rooms.createBattle({
		format: 'gen9roguelikebattle',
		isRoguelikeBattle: true,
		players: [{
			user,
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

function genItem(quantity: number) {
	let all = Dex.items.all().filter(s => !s.isNonstandard);
	all = Utils.shuffle(all);
	const items = [];
	for (let x = 0; x < quantity; x++) {
		const plausibleItem = all.shift();
		if (plausibleItem) items.push(plausibleItem.name);
	}
	return items;
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

	let all = Dex.species.all().filter(s => !s.battleOnly && !s.requiredItems && s.forme !== 'Gmax' && !(s.isNonstandard && s.isNonstandard !== 'Past'));
	if (starter) {
		all = all.filter(s => !s.prevo);

		all = all.filter(s => !(s.tags.includes('Mythical') || s.tags.includes('Restricted Legendary') || s.tags.includes('Sub-Legendary')));

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
		} else if (specie.abilities.H && Math.floor(Math.random() * 20) === 1) {
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

		const rareItems: string[] = [];
		Dex.items.all().forEach(n => {
			if (!n.isNonstandard) {
				rareItems.push(n.name);
			}
		});
		const set: PokemonSet = {
			name: specie.baseSpecies,
			species: specie.name,
			gender: specie.gender || Utils.randomElement(['M', 'F']),
			shiny: (Math.floor(Math.random() * 1024) === 69),
			item: (Math.floor(Math.random() * 20) === 0) ? Utils.randomElement(rareItems) : '',
			ability: setAbil,
			moves: [],
			nature: Utils.randomElement(natures),
			evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },

			ivs: { hp: Math.floor(Math.random() * 32), atk: Math.floor(Math.random() * 32), def: Math.floor(Math.random() * 32), spa: Math.floor(Math.random() * 32), spd: Math.floor(Math.random() * 32), spe: Math.floor(Math.random() * 32) },
			level: minLevel,
		};
		if (depth > 500) {
			set.level = Math.floor(Math.random() * (maxLevel - minLevel)) + minLevel;
			gennedMons.push(set);
		} else {
			for (let curLevel = minLevel; curLevel <= maxLevel; curLevel++) {
				set.level = curLevel;
				// what the fuck
				if (!validate.validateTeam([set])?.some(err => err.includes('must be at least level'))) {
					const randomNo = Math.floor(Math.random() * (maxLevel - curLevel));
					if (randomNo === 0) {
						gennedMons.push(set);
						break;
					}
				}
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

export function roguelikeAI(request: object) {
	if (request.wait) return 'default';
	if (request.forceSwitch) {
		const choiceSlot = Math.floor(Math.random() * (request.side.pokemon.length - 1)) + 2;
		return 'switch ' + choiceSlot;
	}
	if (request.active[0]) {
		const choiceSlot = Math.floor(Math.random() * request.active[0].moves.length) + 1;
		return 'move ' + choiceSlot;
	}
	return 'default';
}

export class Roguelike {
	user: ID;
	battle: number;
	streak: number;
	battlePoints: number;
	team: PokemonSet[];
	teamData: UserTeamData[];
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

	syncAfterMatch(newData: object[]) {
		let index = 0;
		for (const mon of this.teamData) {
			const teamSet = this.team[index];
			const newMon = newData[index];
			// @ts-ignore
			mon.curHP = newMon.curHP;
			// @ts-ignore
			mon.status = newMon.status;
			// @ts-ignore
			mon.ppLeft = newMon.ppLeft;
			mon.exp = newMon.exp;
			teamSet.evs = newMon.evs;
			teamSet.item = newMon.item;
			if (teamSet.level !== newMon.level) {
				teamSet.level = newMon.level;
				mon.expAtNextLevel = getMinExpForMonAtLevel(teamSet.species, teamSet.level + 1);
				mon.maxHP = newMon.maxHP;
			}
			index++;
		}
	}

	win() {
		const RECOMMENDED_TEAM_LENGTH = [2, 3, 3, 4, 4, 5, 6];
		const scale = [5, 10];
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
		if (index !== undefined) {
			let newHpData;
			this.team[index] = pokemon;
			const species = Dex.species.get(pokemon.species);
			if (species.maxHP) {
				newHpData = species.maxHP;
			} else {
				const hpStat = species.baseStats.hp;
				newHpData = Math.floor(((pokemon.ivs.hp + (2 * hpStat) + Math.floor(pokemon.evs.hp / 4) + 100) * pokemon.level) / 100) + 10;
			}
			const ppArr = [];
			for (const move of pokemon.moves) {
				const movePP = Dex.moves.get(move).pp * (8 / 5);
				ppArr.push(movePP);
			}
			this.teamData[index] = {
				linkedTeamIndex: index,
				curHP: newHpData,
				maxHP: newHpData,
				status: false,
				ppLeft: ppArr,
				exp: getMinExpForMonAtLevel(species.name, pokemon.level),
				expAtNextLevel: getMinExpForMonAtLevel(species.name, pokemon.level + 1),
			};
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
			const ppArr = [];
			for (const move of pokemon.moves) {
				const movePP = Dex.moves.get(move).pp * (8 / 5);
				ppArr.push(movePP);
			}
			this.teamData.push({
				linkedTeamIndex: this.team.length - 1,
				curHP: newHpData,
				maxHP: newHpData,
				status: false,
				ppLeft: ppArr,
				exp: getMinExpForMonAtLevel(species.name, pokemon.level),
				expAtNextLevel: getMinExpForMonAtLevel(species.name, pokemon.level + 1),
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

	genUserTeamHTML() {
		let buf = `<center><h3>Team</h3></center><br />`;
		buf += `<table style="width:100%; border-collapse: collapse;"border="1"><tr><th>Status</th><th>Info</th><th>Moves</th></tr>`;
		let linkedIndex = 0;
		for (const mon of this.team) {
			const monData = this.teamData[linkedIndex];
			const dexSpecies = Dex.species.get(mon.species);
			buf += `<tr><td><img src="https://play.pokemonshowdown.com/sprites/gen5/${dexSpecies.spriteid}.png" /><br />${mon.species} ${mon.gender !== 'N' ? '(' + mon.gender + ')' : ''}<br />HP: ${monData.curHP}/${monData.maxHP}<br />Status: ${monData.status ? monData.status.toUpperCase() : 'Healthy'}<br />Level: ${mon.level ? mon.level : 100}<br />Item: ${mon.item === '' ? 'None' : mon.item}`;
			buf += `<br />EXP: ${monData.exp}/${monData.expAtNextLevel}</td>`;
			// @ts-ignore ?????
			buf += `<td>`;
			buf += `Ability: ${mon.ability}<br />`;
			buf += `Tera Type: ${mon.teraType}<br />`;
			const dexNature = Dex.natures.get(mon.nature);
			for (const stat of Object.keys(dexSpecies.baseStats)) {
				const statNumber = dexSpecies.baseStats[stat as StatID];
				let calcStat;
				if (stat === 'hp') {
					calcStat = Math.floor((((mon.ivs[stat] + (2 * statNumber) + Math.floor(mon.evs[stat] / 4) + 100) * mon.level) / 100) + 10);
				} else {
					const mult = (stat === dexNature.plus) ? 1.1 : (stat === dexNature.minus) ? 0.9 : 1;
					calcStat = Math.floor(mult * Math.floor((((mon.ivs[stat as StatID] + (2 * statNumber) + Math.floor(mon.evs[stat as StatID] / 4)) * mon.level) / 100) + 5));
				}
				buf += `${stat.toUpperCase()}: ${calcStat} (EVs: ${mon.evs[stat as StatID]} | IVs: ${mon.ivs[stat as StatID]})<br />`;
			}
			buf += `${mon.nature} Nature<br />`;
			buf += `</td>`;
			buf += `<td>`;
			let linkedMoveIndex = 0;
			for (const move of mon.moves) {
				if (linkedMoveIndex > 0) buf += '<br />';
				const dexMove = Dex.moves.get(move);
				buf += `${dexMove.name}: ${monData.ppLeft[linkedMoveIndex]}/${dexMove.pp * (8 / 5)}`;
				linkedMoveIndex++;
			}
			buf += `</td></tr>`;
			linkedIndex++;
		}
		buf += `</table>`;
		return buf;
	}

	genQuickSelectHTML(checkItem: ItemType) {
		let buf = `<div style="width:100%;"><center>`;
		let cmd;
		let skip = 'shop';
		let failureCondition;
		let index = 1;
		for (const mon of this.team) {
			switch (checkItem) {
			case 'item':
				failureCondition = false;
				cmd = 'giveitem ' + index;
				skip = 'replacepoke skip';
				break;
			case 'pokemon':
				failureCondition = false;
				cmd = 'replacepoke ' + index;
				skip = 'replacepoke skip';
				break;
			case 'healHP':
				failureCondition = this.teamData[index - 1].curHP >= this.teamData[index - 1].maxHP || this.teamData[index - 1].status === 'fnt';
				cmd = 'redeem healhp, ' + index;
				break;
			case 'healPP':
				failureCondition = this.teamData[index - 1].ppLeft.every((v, i) => Dex.moves.get(this.team[index - 1].moves[i]).pp * (8 / 5) === v);
				cmd = 'redeem healpp, ' + index;
				break;
			case 'cureStatus':
				failureCondition = !(this.teamData[index - 1].status && this.teamData[index - 1].status !== 'fnt');
				cmd = 'redeem curestatus, ' + index;
				break;
			case 'revive':
				failureCondition = this.teamData[index - 1].status !== 'fnt';
				cmd = 'redeem revive, ' + index;
				break;
			case 'TM':
			case 'key':
			case 'scout':
			case 'debug':
			}
			if (failureCondition) {
				buf += `<button class="button disabled"><psicon pokemon ="${mon.species}"> ${mon.name}</button>`;
			} else {
				buf += `<button class="button" name="send" value="/roguelike ${cmd}"><psicon pokemon ="${mon.species}" /> ${mon.name}</button>`;
			}
			if (index < this.team.length) {
				buf += `&nbsp;&nbsp;&nbsp;&nbsp;`;
			}
			index++;
		}
		buf += `<br /><br /><button class="button" name="send" value="/roguelike ${skip}">Skip</button>`;
		buf += `</center></div>`;
		return buf;
	}

	genShopHTML() {
		let buf = `<center><h3>Shop</h3></center><br />`;
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
		let exitButtonText = 'Leave and go back to shop.';
		switch ((this.flags.purchasedItem as ShopItem)?.type) {
		case 'pokemon':
			exitButtonText = 'Skip';
			buf += `<center><h3>Add a Pokemon!</h3><br />`;
			buf += `<div style="width:100%;">`;
			// @ts-ignore
			for (const poke of this.flags.pokemonOptions) {
				buf += `<button class="button" name="send" value="/roguelike redeem pokemon, ${toID(poke.species)}"><img src="https://play.pokemonshowdown.com/sprites/gen5/${Dex.species.get(poke.species).spriteid}.png" /></button>`;
			}
			buf += `</div>`;
			break;
		case 'healHP':
		case 'healPP':
		case 'revive':
		case 'cureStatus':
			buf = `<center>Use this on who?</h3></center><br />`;
			buf += this.genQuickSelectHTML((this.flags.purchasedItem as ShopItem)?.type);
			return buf;
		case 'TM':
			break;
		case 'key':
			break;
		case 'scout':
			break;
		case 'item':
			exitButtonText = 'Skip';
			buf += `<center><h3>Get an item!</h3><br />`;
			buf += `<div style="width:100%;">`;
			// @ts-ignore
			for (const item of this.flags.itemOptions) {
				buf += `<button class="button" name="send" value="/roguelike redeem item, ${toID(item)}"><psicon item="${item}" />${item}</button>`;
			}
			buf += `</div>`;
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
	game: {
		'': 'getpage',
		getpage(target, room, user) {
			return this.parse(`/join view-roguelike`);
		},
	},
	roguelike: {
		'': 'getpage',
		getpage(target, room, user) {
			return this.parse(`/join view-roguelike`);
		},
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
		checkteam(target, room, user) {
			const userData = roguelikeGames.get(user.id);
			if (!userData || userData.runEnded) return this.errorReply(`You need to make a new run first.`);
			if (!checkSequence(userData.curRoom, 'shop')) return this.errorReply(`Can't go here yet!`);
			userData.goToPage('shop-team');
		},
		buy(target, room, user) {
			const userData = roguelikeGames.get(user.id);
			if (!userData || userData.runEnded) return this.errorReply(`You need to make a new run first.`);
			if (userData.curRoom !== 'shop') return this.errorReply(`Can't buy stuff yet!`);
			const item = SHOP_ITEMS[target] || false;
			if (!item) return this.errorReply('Does that item even exist?');
			if (item.cost > userData.battlePoints) return this.popupReply(`You don't have enough BP to buy this!`);
			switch (item.type) {
			case 'pokemon':
				const scale = [5, 10];
				scale.forEach((e, i) => scale[i] = Utils.clampIntRange(e + (userData.streak * 5), 1, 100));
				userData.flags.pokemonOptions = genPokemon(3, scale);
				break;
			case 'healHP':
			case 'healPP':
			case 'revive':
			case 'cureStatus':
			case 'TM':
			case 'key':
			case 'scout':
			case 'debug':
			case 'item':
				userData.flags.itemOptions = genItem(3);
				break;
			}
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
			if (userData.team.length >= 6) {
				// TODO: Figure out releasing pokemon.
			} else {
				userData.addPokemon(poke);
			}
			delete userData.flags.pokemonOptions;
			userData.opponentTeam = genPokemon(1, 5, true);
			const newFoe = userData.createAITrainer();
			createAIBattle(userData.user, newFoe);
		},
		redeem(target, room, user) {
			let index: number;
			const userData = roguelikeGames.get(user.id);
			if (!userData || userData.runEnded) return this.errorReply(`You need to make a new run first.`);
			if (!userData.flags.purchasedItem) return this.errorReply(`You need to purchase something first.`);
			const args = target.split(',');
			let arg = args.shift();
			switch (arg) {
			case 'pokemon':
				if (!userData.flags.pokemonOptions) return this.errorReply(`No Pokemon to add.`);
				arg = args.shift();
				if (!arg) return this.errorReply(`You need to specify a pokemon.`);
				const pokes = userData.flags.pokemonOptions;
				const poke = pokes.find(p => toID(p.species) === toID(arg));
				if (!poke) return this.errorReply(`You can't choose that pokemon.`);
				if (userData.team.length >= 6) {
					userData.flags.replacingWith = poke;
					userData.goToPage('purchase-release');
					delete userData.flags.pokemonOptions;
					return;
				} else {
					userData.addPokemon(poke);
				}
				delete userData.flags.pokemonOptions;
				break;
			case 'healhp':
				arg = args.shift();
				if (!arg) return this.errorReply(`You need to specify a pokemon.`);
				index = parseInt(arg);
				index--;
				if (!userData.team[index]) return this.errorReply(`You need to specify a pokemon on your team.`);
				if (userData.teamData[index].curHP === userData.teamData[index].maxHP) return this.errorReply(`You can't use this on that pokemon.`);
				userData.teamData[index].curHP = userData.teamData[index].maxHP;
				// TODO: More items
				break;
			case 'healpp':
				arg = args.shift();
				if (!arg) return this.errorReply(`You need to specify a pokemon.`);
				index = parseInt(arg);
				index--;
				if (!userData.team[index]) return this.errorReply(`You need to specify a pokemon on your team.`);
				if (userData.teamData[index].ppLeft.every((v, i) => Dex.moves.get(userData.team[index].moves[i]).pp * (8 / 5) === v)) return this.errorReply(`You can't use this on that pokemon.`);
				userData.teamData[index].ppLeft.forEach((v, i) => userData.teamData[index].ppLeft[i] = Dex.moves.get(userData.team[index].moves[i]).pp * (8 / 5));
				// TODO: More items
				break;
			case 'curestatus':
				arg = args.shift();
				if (!arg) return this.errorReply(`You need to specify a pokemon.`);
				index = parseInt(arg);
				index--;
				if (!userData.team[index]) return this.errorReply(`You need to specify a pokemon on your team.`);
				if (!userData.teamData[index].status || userData.teamData[index].status === 'fnt') return this.errorReply(`You can't use this on that pokemon.`);
				userData.teamData[index].status = false;
				// TODO: More items
				break;
			case 'revive':
				arg = args.shift();
				if (!arg) return this.errorReply(`You need to specify a pokemon.`);
				index = parseInt(arg);
				index--;
				if (!userData.team[index]) return this.errorReply(`You need to specify a pokemon on your team.`);
				if (userData.teamData[index].status !== 'fnt') return this.errorReply(`You can't use this on that pokemon.`);
				userData.teamData[index].curHP = Math.floor(userData.teamData[index].maxHP / 2);
				userData.teamData[index].status = false;
				// TODO: More items
				break;
			case 'item':
				arg = args.shift();
				if (!arg) return this.errorReply(`You need to specify an item.`);
				const dexItem = Dex.items.get(arg);
				if (!dexItem) return this.errorReply(`You need to specify an item.`);
				userData.flags.newItem = dexItem.name;
				userData.goToPage('purchase-item');
				delete userData.flags.itemOptions;
				return;
			default:
				return this.errorReply(`Your command is too vague.`);
			}
			if (userData.flags.purchasedItem) delete userData.flags.purchasedItem;
			userData.goToPage('shop');
		},
		replacepoke(target, room, user) {
			const userData = roguelikeGames.get(user.id);
			if (!userData || userData.runEnded) return this.errorReply(`You need to make a new run first.`);
			if (!userData.flags.replacingWith) return this.errorReply(`You need to purchase something first.`);
			if (target === 'skip') {
				delete userData.flags.replacingWith;
				if (userData.flags.purchasedItem) delete userData.flags.purchasedItem;
				userData.goToPage('shop');
				return;
			}
			const index = parseInt(target);
			if (index && index <= 6) {
				userData.addPokemon(userData.flags.replacingWith, index - 1);
				delete userData.flags.replacingWith;
				if (userData.flags.purchasedItem) delete userData.flags.purchasedItem;
			}
			userData.goToPage('shop');
		},
		giveitem(target, room, user) {
			const userData = roguelikeGames.get(user.id);
			if (!userData || userData.runEnded) return this.errorReply(`You need to make a new run first.`);
			if (!userData.flags.newItem) return this.errorReply(`You need to purchase something first.`);
			if (target === 'skip') {
				delete userData.flags.newItem;
				if (userData.flags.purchasedItem) delete userData.flags.purchasedItem;
				userData.goToPage('shop');
				return;
			}
			const index = parseInt(target);
			if (index && index <= 6) {
				userData.team[index - 1].item = userData.flags.newItem;
				delete userData.flags.newItem;
				if (userData.flags.purchasedItem) delete userData.flags.purchasedItem;
			}
			userData.goToPage('shop');
		},
		next(target, room, user) {
			const userData = roguelikeGames.get(user.id);
			if (!userData || userData.runEnded) return this.errorReply(`You need to make a new run first.`);
			if (!checkSequence(userData.curRoom, 'battle') || userData.inBattle) return this.errorReply(`Can't battle yet!`);
			const newFoe = userData.createAITrainer();
			createAIBattle(userData.user, newFoe);
		},
	},
};

export const pages: Chat.PageTable = {
	roguelike(args, user) {
		const userGameData = roguelikeGames.get(user.id);
		if (!user.named) return Rooms.RETRY_AFTER_LOGIN;
		if (!userGameData) {
			let buf = `<div class = "pad">`;
			buf += `Hello and welcome to my roguelike. This was a project I made at the start of the year and maybe it'll be fun. Please report all bugs to me, HiZo (that is my username on Pokemon Showdown/Smogon. My username is 'hisuianzoroark' on Discord).`;
			buf += `<br /><button class="button" name="send" value="/roguelike start">Start a run</button></center>`;
			buf += `</div>`;
			return buf;
		}
		const gameArgs = userGameData.curRoom.split('-');
		const mainRoomArg = gameArgs.shift();
		let subtitle = '';
		let buf = `<div class = "pad">`;
		switch (mainRoomArg) {
		case 'battle':
			if (userGameData.inBattle) {
				this.title = '[Roguelike] Currently in battle';
				return this.errorReply('You are currently in battle!');
			} else {
				buf += `Something went wrong, please try again.`;
				buf += `<br /><button class="button" name="send" value="/roguelike next">Redo Battle</button></center>`;
			}
			break;
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
			switch (gameArgs.shift()) {
			case 'team':
				buf += `<button class="button" name="send" value="/roguelike shop">Go back to shop</button>`;
				buf += userGameData.genUserTeamHTML();
				break;
			default:
				buf += `<button class="button" name="send" value="/roguelike checkteam">Check your team</button>`;
				buf += userGameData.genShopHTML();
				buf += `<br /><button class="button" name="send" value="/roguelike next">Start the next battle!</button>`;
			}
			break;
		case 'purchase':
			if (!userGameData.flags.purchasedItem) {
				this.title = '[Roguelike] Purchase Error';
				return this.errorReply('If you tried to purchased something and reached this error, contact HiZo.');
			}
			subtitle = 'Complete Purchase';
			switch (gameArgs.shift()) {
			case 'release':
				buf = `<center>Choose a pokemon to replace!</center><br />`;
				buf += userGameData.genQuickSelectHTML('pokemon');
				break;
			case 'item':
				buf = `<center>Give this item to who?</center><br />`;
				buf += userGameData.genQuickSelectHTML('item');
				break;
			default:
				buf += userGameData.genPurchaseHTML();
			}
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
				roguelikePlayer.inBattle = true;
				roguelikePlayer.goToPage('battle');
			}
		}
	},

	onBattleEnd(battle, winner, players) {
		if (!battle.options.isRoguelikeBattle) return;
		// Player 1 is the always the human
		const human = players[0];
		const humanGameData = roguelikeGames.get(human);
		if (!humanGameData) return;
		humanGameData.inBattle = false;
		if (human === winner) {
			if (battle.currentData) humanGameData.syncAfterMatch(battle.currentData);
			humanGameData.win();
		} else {
			humanGameData.lose();
		}
		humanGameData.goToPage('results');
	},
};

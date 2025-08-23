/**
* HiZo's Untitled Roguelike
* @author HiZo
* @version Alpha 3 (Codename: Porygon2)
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

function checkForEvolution(pokemon: Pokemon, misc?: any) {
	const evoList = Dex.species.get(pokemon.species).evos;
	if (!evoList) return;
	for (const newEvo of evoList) {
		switch (Dex.species.get(newEvo).evoType) {
			// figure out rest later
			case 'useItem':
				if (typeof misc === 'string' && Dex.species.get(newEvo).evoItem === misc) {
					pokemon.m.willEvolve = newEvo;
				}
				break;
		}
	}
}

function itemURLFormat(item: string) {
	return item.replaceAll(/[^a-zA-Z0-9 \-]+/g, '').toLowerCase().replaceAll(' ', '-');
}

type ItemType = 'pokemonPack' | 'healHP' | 'healPP' | 'TM' | 'key' | 'debug' | 'revive' | 'cureStatus' | 'itemPack' | 'item' | 'evolveItem';

type opponentScout = 'revealMon' | 'revealSet' | false;

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

interface RotationalItem {
	name: string;
	cost: number;
	icon: string;
	type: ItemType;
	desc: string;
	minStreak: number;
}

interface TMItem extends RotationalItem {
	move: string;
}

interface PokePackWeighting {
	range: number;
	midpoint: number;
	weightcap: number;
	special?: string; // TODO: 'Fun' packs
}

const TM_LIST: { [k: string]: TMItem } = JSON.parse(FS('data/roguelike/tmdb.json').readSync());

const ROTATIONAL_ITEM_POOL: { [k: string]: RotationalItem | TMItem } = JSON.parse(FS('data/roguelike/itemdb.json').readSync());

Object.assign(ROTATIONAL_ITEM_POOL, TM_LIST);

const SHOP_ITEMS: { [k: string]: ShopItem } = {
	pokeballpack: { name: 'Poke Ball Pack', icon: 'Poke Ball', type: 'pokemonPack', desc: 'Pick 1 of 3 weak random Pokemon.', cost: 5, minStreak: 0 },
	greatballpack: { name: 'Great Ball Pack', icon: 'Great Ball', type: 'pokemonPack', desc: 'Pick 1 of 3 decent random Pokemon.', cost: 8, minStreak: 1 },
	ultraballpack: { name: 'Ultra Ball Pack', icon: 'Ultra Ball', type: 'pokemonPack', desc: 'Pick 1 of 3 good random Pokemon.', cost: 12, minStreak: 3 },
	masterballpack: { name: 'Master Ball Pack', icon: 'Master Ball', type: 'pokemonPack', desc: 'Pick 1 of 3 strong random Pokemon.', cost: 25, minStreak: 7 },
	helditempack: { name: 'Held Item Pack', icon: 'Leftovers', type: 'itemPack', desc: 'Pick 1 of 3 held items to put on a Pokemon', cost: 3, minStreak: 0 },
	potion: { name: 'Potion', icon: 'Potion', type: 'healHP', desc: 'Heals 20 HP for a Pokemon.', cost: 3, minStreak: 0 },
	superpotion: { name: 'Super Potion', icon: 'Super Potion', type: 'healHP', desc: 'Heals 50 HP for a Pokemon.', cost: 5, minStreak: 1 },
	hyperpotion: { name: 'Hyper Potion', icon: 'Hyper Potion', type: 'healHP', desc: 'Heals 120 HP for a Pokemon.', cost: 7, minStreak: 4 },
	maxpotion: { name: 'Max Potion', icon: 'Max Potion', type: 'healHP', desc: 'Heals a pokemon\'s HP fully.', cost: 10, minStreak: 6 },
	maxelixir: { name: 'Max Elixir', icon: 'Max Elixir', type: 'healPP', desc: 'Restores the PP of all of a pokemon\'s moves.', cost: 5, minStreak: 0 },
	fullheal: { name: 'Full Heal', icon: 'Full Heal', type: 'cureStatus', desc: 'Cures a pokemon\'s status.', cost: 3, minStreak: 0 },
	revive: { name: 'Revive', icon: 'Revive', type: 'revive', desc: 'Revives a Pokemon to half its maximum HP.', cost: 7, minStreak: 1 },
	expall: { name: 'Exp. All', icon: 'Exp Share', type: 'key', desc: 'Gives 50% Exp. to all non-fainted Pokemon not in the battle', cost: 25, minStreak: 2 },
	// debug2: { name: 'Debug 2', icon: 'berserk gene', type: 'debug', desc: 'Bans HoeenHero from this server twice.', cost: 999, minStreak: 1 },
};

interface UserTeamData {
	linkedTeamIndex: number;
	curHP: number;
	status: string | false;
	ppLeft: number[];
	exp: number;
	expAtNextLevel: number;
	maxHP: number;
	evoFlag: any; // Have mercy on my soul
}

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
	keyItems: string[];
	rotationalShop: string[];
	timesRerolled: number;
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
		allowRenames: false,
		players: [{
			user,
			team: Teams.pack(gameData.team) || '',
			roguelikeTeamData: { teamData: gameData.teamData, keyItems: gameData.keyItems },
			// @ts-expect-error AI has no user data
		}, {
			username: ai.name,
			team: Teams.pack(ai.team) || '',
			isAI: true,
		}],
	});
}

function genItem(quantity: number, extraArg?: PokemonSet[] | string) {
	let all = Dex.items.all().filter(s => (s.isGem || s.itemUser || s.zMove) || !s.isNonstandard);
	all = all.filter(i => {
		if (i.itemUser) {
			if (typeof extraArg === 'string') {
				const dexSpecies = Dex.species.get(extraArg);
				let validSpecies = [dexSpecies.name];
				if (dexSpecies.otherFormes) validSpecies = validSpecies.concat(dexSpecies.otherFormes);
				return i.itemUser.some(v => validSpecies.includes(v));
			} else if (extraArg?.length) {
				return extraArg.some(poke => {
					const dexSpecies = Dex.species.get(poke.species);
					let validSpecies = [dexSpecies.name];
					if (dexSpecies.otherFormes) validSpecies = validSpecies.concat(dexSpecies.otherFormes);
					return i.itemUser.some(v => validSpecies.includes(v));
				});
			}
		} else {
			if (i.zMove) return true;
			return Object.keys(i).some(k => {
				if (typeof i[k] === 'function') {
					return true;
				}
				return false;
			});
		}
	});
	all = Utils.shuffle(all);
	const items = [];
	while (items.length < quantity) {
		const plausibleItem = all.shift();
		if (plausibleItem) {
			items.push(plausibleItem.name);
		} else {
			break;
		}
	}
	return items;
}

function getMovesAtTarget(pokemon: string, target: 'M' | 'T' | 'L' | 'R' | 'E' | 'D' | 'S' | 'V' | 'C' | 'any', level?: number) {
	let genNumber = 9;
	while (genNumber > 1) {
		if (Dex.mod(`gen${genNumber}`).species.get(toID(pokemon)).isNonstandard) {
			genNumber--;
			continue;
		}
		break;
	}
	if (toID(pokemon) === 'floetteeternal') {
		genNumber = 6;
	} else if (toID(pokemon) === 'eternatuseternamax') {
		genNumber = 8;
	}
	const prevoList = [];
	let dexSpecies = Dex.species.get(pokemon);
	while (dexSpecies.prevo) {
		prevoList.push(dexSpecies.prevo);
		dexSpecies = Dex.species.get(dexSpecies.prevo);
	}
	const fullLearn = Dex.species.getFullLearnset(toID(pokemon));
	const movesAtlevel: string[] = [];
	for (const learnsetIndex of fullLearn) {
		if (prevoList) {
			prevoList.forEach(p => {
				const learnset = Dex.species.getLearnsetData(toID(p));
				if (learnset.species.name !== p) p = learnset.species.name;
			});
			if (prevoList.includes(learnsetIndex.species.name)) {
				continue;
			}
		}
		const learnset = learnsetIndex.learnset;
		for (const move in learnset) {
			if (target === 'any') {
				movesAtlevel.push(move);
				continue;
			}
			const learnSetstring = target === 'L' ? `${genNumber}${target}${level}` : genNumber + target;
			if (learnset[move].some(source => source === learnSetstring)) {
				if (!movesAtlevel.includes(move)) {
					movesAtlevel.push(move);
				}
			}
		}
	}
	// randomize moves at equal level
	Utils.shuffle(movesAtlevel);
	return movesAtlevel;
}

function genPokemon(quantity: number, level: number | number[], weighting?: PokePackWeighting, starter?: boolean) {
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

	let all = Dex.species.all().filter(s => !s.battleOnly && !s.requiredItems && s.forme !== 'Gmax' && !s.forme.includes('Totem') && s.forme !== 'Dusk' && s.forme !== 'Bond' && !(s.isNonstandard && s.isNonstandard !== 'Past'));
	if (starter) {
		all = all.filter(s => !s.prevo);

		all = all.filter(s => !(s.tags.includes('Mythical') || s.tags.includes('Restricted Legendary') || s.tags.includes('Sub-Legendary')));

		all = all.filter(s => !(s.tags.includes('Paradox') || ['Gouging Fire', 'Raging Bolt', 'Iron Crown', 'Iron Boulder'].includes(s.baseSpecies)));
		all = all.filter(s => !s.tags.includes('Ultra Beast') || s.name === 'Poipole');
		all = all.filter(s => !['Ursaluna-Bloodmoon', 'Floette-Eternal'].includes(s.name));
	}
	let pokePool = [];
	for (const contender of all) {
		let newScore = 1;
		if (weighting) {
			let x_value = contender.bst;
			switch (contender.id) {
			case 'shedinja':
				x_value = 500;
				break;
			case 'eternatuseternamax':
				// If this shows up again something went wrong (in my mind)
				// x_value = 725; // Unfeasible to appear otherwise
				break;
			}
			const probWeight = (-1 / weighting.range) * (x_value - weighting.midpoint) ** 2 + (weighting.weightcap + weighting.range);
			newScore = Utils.clampIntRange(probWeight, 0, weighting.weightcap);
		}
		pokePool.push({ specie: contender, score: newScore });
	}
	pokePool = pokePool.filter(i => i.score > 0);
	let depth = 0;
	while (gennedMons.length < quantity) {
		let index = -1;
		const maxVal = pokePool.reduce((a, b) => a + b.score, 0);
		const randomValue = Math.floor(Math.random() * maxVal);
		let curValue = 0;
		for (const contender of pokePool) {
			curValue += contender.score;
			if (curValue > randomValue) {
				index = pokePool.indexOf(contender);
				break;
			}
		}
		const specie = pokePool[index].specie;
		if (!specie) {
			throw new Error('Somehow there is no Pokemon');
		}
		pokePool.splice(index, 1);
		let setAbil;
		// TODO: Assess the Pupitar problem
		if (specie.abilities.S && Math.floor(Math.random() * 50) === 1) {
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
		const types: string[] = [];
		Dex.types.all().forEach(n => types.push(n.name));

		const set: PokemonSet = {
			name: specie.baseSpecies,
			species: specie.name,
			gender: specie.gender || Utils.randomElement(['M', 'F']),
			shiny: (Math.floor(Math.random() * 1024) === 69),
			item: (Math.floor(Math.random() * 20) === 0) ? Utils.randomElement(genItem(1, specie.name)) : '',
			ability: setAbil,
			moves: [],
			nature: Utils.randomElement(natures),
			evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
			teraType: (Math.floor(Math.random() * 20) === 0) ? Utils.randomElement(types) : Utils.randomElement(specie.types),

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
	for (const moveless of gennedMons) {
		let viableMoves: string[] = [];
		for (let lvl = 0; lvl <= moveless.level; lvl++) {
			const movesAtlevel = getMovesAtTarget(moveless.species, 'L', lvl);
			viableMoves = viableMoves.concat(movesAtlevel);
		}
		viableMoves = [...new Set(viableMoves)];
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

function refreshPage(userID: ID) {
	const realUser = Users.get(userID);
	if (realUser) {
		for (const conn of realUser.connections) {
			void Chat.parse(`/join view-roguelike`, null, realUser, conn);
		}
	}
}

export class Roguelike {
	user: ID;
	battle: number;
	streak: number;
	battlePoints: number;
	team: PokemonSet[];
	teamData: UserTeamData[];
	keyItems: string[];
	rotationalShop: string[];
	timesRerolled: number;
	flags: {
		pokemonOptions?: PokemonSet[],
		opponentTeamScout?: opponentScout[],
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
		this.keyItems = backup?.keyItems || [];
		this.rotationalShop = backup?.rotationalShop || [];
		this.timesRerolled = backup?.timesRerolled || 0;
		this.opponentTeam = backup?.opponentTeam || [];
		this.curRoom = backup?.curRoom || 'intro';
		this.runEnded = backup?.runEnded || false;
		this.inBattle = false;
	}

	syncAfterMatch(newData: object[]) {
		let index = 0;
		for (const mon of this.teamData) {
			const teamSet = this.team[index];
			const dexSpecies = Dex.species.get(teamSet.species);
			const newMon = newData[index];
			// @ts-expect-error
			mon.curHP = newMon.curHP;
			// @ts-expect-error
			mon.status = newMon.status;
			// @ts-expect-error
			mon.ppLeft = newMon.ppLeft;
			mon.exp = newMon.exp;
			// @ts-expect-error
			mon.evoFlag = newMon.evoFlag;
			teamSet.evs = newMon.evs;
			teamSet.item = newMon.item;
			teamSet.moves = newMon.moves;
			if (teamSet.level !== newMon.level) {
				teamSet.level = newMon.level;
				mon.expAtNextLevel = getMinExpForMonAtLevel(teamSet.species, teamSet.level + 1);
			}
			if (dexSpecies.maxHP) {
				mon.maxHP = dexSpecies.maxHP;
			} else {
				mon.maxHP = Math.floor((((teamSet.ivs['hp'] + (2 * dexSpecies.baseStats['hp']) + Math.floor(teamSet.evs['hp'] / 4) + 100) * teamSet.level) / 100) + 10);
			}
			index++;
		}
	}

	rollShop() {
		this.rotationalShop = [];
		const shuffled = Utils.shuffle(Object.keys(ROTATIONAL_ITEM_POOL));
		let index = 0;
		while (this.rotationalShop.length < 5 && index < shuffled.length) {
			const dexItem = Dex.items.get(ROTATIONAL_ITEM_POOL[shuffled[index]].name);
			if (ROTATIONAL_ITEM_POOL[shuffled[index]].type === 'item') {
				if (dexItem.isNonstandard === 'CAP') {
					index++;
					continue;
				}
				const isViable = dexItem.itemUser || dexItem.zMove || Object.keys(dexItem).some(k => {
					if (typeof dexItem[k] === 'function') {
						return true;
					}
					return false;
				});
				if (dexItem.itemUser && !this.team.some(p => dexItem.itemUser?.includes(p.species))) {
					index++;
					continue;
				}
				if (!isViable) {
					index++;
					continue;
				}
			} else if (ROTATIONAL_ITEM_POOL[shuffled[index]].type === 'evolveItem') {
				if (!this.team.some(p => Dex.species.get(p.species).evoItem === dexItem.name)) {
					index++;
					continue;
				}
			}
			this.rotationalShop.push(shuffled[index]);
			index++;
		}
	}

	win() {
		const RECOMMENDED_WEIGHTING = { midpoint: 250, range: 50, weightcap: 100 } as PokePackWeighting;
		const RECOMMENDED_TEAM_LENGTH = [2, 3, 3, 4, 4, 5, 6];
		const scale = [5, 10];
		if (this.battle % 7 === 0) {
			this.streak++;
			this.battlePoints += 5;
			let index = 0;
			for (const monData of this.teamData) {
				monData.curHP = monData.maxHP;
				monData.ppLeft.forEach((v, i) => monData.ppLeft[i] = Dex.moves.get(this.team[index].moves[i]).pp * (8 / 5));
				monData.status = false;
				index++;
			}
		}
		this.battle++;
		this.battlePoints += 5;
		scale.forEach((e, i) => scale[i] = Utils.clampIntRange(e + (this.streak * 5), 1, 100));
		const num = RECOMMENDED_TEAM_LENGTH[Utils.clampIntRange(this.streak, 0, 6)];
		RECOMMENDED_WEIGHTING.midpoint = Utils.clampIntRange(RECOMMENDED_WEIGHTING.midpoint + (this.streak * 50), 0, 650);
		this.opponentTeam = genPokemon(num, scale, RECOMMENDED_WEIGHTING);
		this.flags.opponentTeamScout = [];
		this.opponentTeam = this.opponentTeam.sort((a, b) => a.level - b.level);
		for (let x = 0; x < this.opponentTeam.length; x++) {
			this.flags.opponentTeamScout.push(false);
		}
		this.rollShop();
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
				evoFlag: false,
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
				evoFlag: false,
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

	goToPage(target: string) {
		this.curRoom = target;
		refreshPage(this.user);
		const realUser = Users.get(this.user);
		if (realUser) realUser.lastCommand = '';
		saveRoguelikeData();
	}

	genUserTeamHTML() {
		let buf = `<center><h3>Team</h3></center><br />`;
		buf += `<table style="width:100%; border-collapse: collapse;"border="1"><tr><th>Status</th><th>Info</th><th>Moves</th></tr>`;
		let linkedIndex = 0;
		for (const mon of this.team) {
			const monData = this.teamData[linkedIndex];
			const dexSpecies = Dex.species.get(mon.species);
			const path = mon.shiny ? `gen5-shiny` : `gen5`;
			buf += `<tr><td><img src="https://play.pokemonshowdown.com/sprites/${path}/${dexSpecies.spriteid}.png" /><br />${mon.species} ${mon.gender !== 'N' ? '(' + mon.gender + ')' : ''}<br />HP: ${monData.curHP}/${monData.maxHP}<br />Status: ${monData.status ? monData.status.toUpperCase() : 'Healthy'}<br />Level: ${mon.level ? mon.level : 100}<br />Item: ${mon.item === '' ? 'None' : mon.item}`;
			buf += `<br />EXP: ${monData.exp}/${monData.expAtNextLevel}</td>`;
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
			buf += `<td><button class="button" name="send" value="/roguelike switch ${linkedIndex + 1}">Move</button>`;
			buf += `</td></tr>`;
			linkedIndex++;
		}
		buf += `</table>`;
		return buf;
	}

	genMiscTeamHTML(data: PokemonSet[], reason?: string) {
		let cmd;
		let buttonText;
		let buf = `<table style="width:100%; border-collapse: collapse;"border="1"><tr><th>Status</th><th>Info</th><th>Moves</th></tr>`;
		for (const mon of data) {
			switch (reason) {
			case 'starter':
				cmd = `addstarter ${toID(mon.species)}`;
				buttonText = `Pick starter`;
				break;
			default:
				cmd = `redeem pokemon, ${toID(mon.species)}`;
				buttonText = `Add Pokemon`;
				break;
			}
			const dexSpecies = Dex.species.get(mon.species);
			const path = mon.shiny ? `gen5-shiny` : `gen5`;
			buf += `<tr><td><img src="https://play.pokemonshowdown.com/sprites/${path}/${dexSpecies.spriteid}.png" /><br />${mon.species} ${mon.gender !== 'N' ? '(' + mon.gender + ')' : ''}<br />Level: ${mon.level ? mon.level : 100}<br />Item: ${mon.item === '' ? 'None' : mon.item}`;
			// @ts-expect-error ?????
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
				buf += `${dexMove.name}`;
				linkedMoveIndex++;
			}
			buf += `<td><button class="button" name="send" value="/roguelike ${cmd}">${buttonText}</button>`;
			buf += `</td></tr>`;
		}
		buf += `</table>`;
		return buf;
	}

	genScoutHTML() {
		let buf = `<table style="width:100%; border-collapse: collapse;"border="1"><tr><th>Status</th><th>Info</th><th>Moves</th></tr>`;
		let linkedOpponentIndex = 0;
		for (const mon of this.opponentTeam) {
			let buttonText;
			const scoutData = this.flags.opponentTeamScout[linkedOpponentIndex];
			switch (scoutData) {
			case 'revealMon':
				buttonText = 'Reveal Set (3 BP)';
				break;
			case 'revealSet':
				buttonText = 'Already scouted!';
				break;
			default:
				buttonText = 'Reveal Pokemon (2 BP)';
				break;
			}
			buf += `<tr><td>`;
			const dexSpecies = Dex.species.get(mon.species);
			if (!scoutData) {
				buf += `???`;
			} else {
				const path = mon.shiny ? `gen5-shiny` : `gen5`;
				buf += `<img src="https://play.pokemonshowdown.com/sprites/${path}/${dexSpecies.spriteid}.png" /><br />${mon.species} ${mon.gender !== 'N' ? '(' + mon.gender + ')' : ''}<br />Level: ${mon.level ? mon.level : 100}`;
				if (scoutData === 'revealSet') buf += `<br />Item: ${mon.item === '' ? 'None' : mon.item}`;
			}
			// @ts-expect-error ?????
			buf += `<td>`;
			if (scoutData === 'revealSet') {
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
			} else {
				buf += `???`;
			}
			buf += `</td>`;
			buf += `<td>`;
			if (scoutData === 'revealSet') {
				let linkedMoveIndex = 0;
				for (const move of mon.moves) {
					if (linkedMoveIndex > 0) buf += '<br />';
					const dexMove = Dex.moves.get(move);
					buf += `${dexMove.name}`;
					linkedMoveIndex++;
				}
			} else {
				buf += `???`;
			}
			switch (scoutData) {
			case 'revealMon':
				if (3 > this.battlePoints) {
					buf += `<td><button class="button disabled">Not enough BP!</button>`;
				} else {
					buf += `<td><button class="button" name="send" value="/roguelike scoutslot ${linkedOpponentIndex + 1}">${buttonText}</button>`;
				}
				break;
			case 'revealSet':
				buf += `<td><button class="button disabled">Already scouted!</button>`;
				break;
			default:
				buttonText = 'Reveal Pokemon (2 BP)';
				if (2 > this.battlePoints) {
					buf += `<td><button class="button disabled">Not enough BP!</button>`;
				} else {
					buf += `<td><button class="button" name="send" value="/roguelike scoutslot ${linkedOpponentIndex + 1}">${buttonText}</button>`;
				}
				break;
			}

			buf += `</td></tr>`;
			linkedOpponentIndex++;
		}
		buf += `</table>`;
		return buf;
	}

	genMoveSelectHTML(pokemon: PokemonSet) {
		let buf = `<div style="width:100%;"><center>`;
		let index = 0;
		for (const move of pokemon.moves) {
			if (index > 0) buf += `&nbsp;&nbsp;&nbsp;&nbsp;`;
			buf += `<button class="button" name="send" value="/roguelike learnmove ${index}">${move}</button>`;
			index++;
		}
		buf += `<br /><br /><button class="button" name="send" value="/roguelike learnmove done">Cancel</button>`;
		buf += `</center></div>`;
		return buf;
	}

	genQuickSelectHTML(checkItem: ItemType | "switch", targetIndex?: number) {
		let buf = `<div style="width:100%;"><center>`;
		let cmd;
		let skip = 'shop';
		let skipmsg = 'Skip';
		let failureCondition;
		let index = 1;
		for (const mon of this.team) {
			switch (checkItem) {
			case 'item':
				skipmsg = 'Undo';
				// Falls through
			case 'itemPack':
				failureCondition = false;
				cmd = 'giveitem ' + index;
				skip = 'giveitem skip';
				break;
			case 'pokemonPack':
				failureCondition = false;
				cmd = 'replacepoke ' + index;
				skip = 'replacepoke skip';
				break;
			case 'healHP':
				failureCondition = this.teamData[index - 1].curHP >= this.teamData[index - 1].maxHP || this.teamData[index - 1].status === 'fnt';
				cmd = 'redeem healhp, ' + index;
				skipmsg = 'Undo';
				break;
			case 'healPP':
				failureCondition = this.teamData[index - 1].ppLeft.every((v, i) => Dex.moves.get(this.team[index - 1].moves[i]).pp * (8 / 5) === v);
				cmd = 'redeem healpp, ' + index;
				skipmsg = 'Undo';
				break;
			case 'cureStatus':
				failureCondition = !(this.teamData[index - 1].status && this.teamData[index - 1].status !== 'fnt');
				cmd = 'redeem curestatus, ' + index;
				skipmsg = 'Undo';
				break;
			case 'revive':
				failureCondition = this.teamData[index - 1].status !== 'fnt';
				cmd = 'redeem revive, ' + index;
				skipmsg = 'Undo';
				break;
			case 'switch':
				failureCondition = index === targetIndex;
				cmd = `switch ${targetIndex}, ` + index;
				skip = 'switch undo';
				skipmsg = 'Undo';
				break;
			case 'TM':
				failureCondition = (!getMovesAtTarget(mon.species, 'any').includes(toID(this.flags.moveToLearn)) || mon.moves.includes(this.flags.moveToLearn));
				cmd = 'redeem tm, ' + index;
				skipmsg = 'Undo';
				break;
			case 'key':
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
		buf += `<br /><br /><button class="button" name="send" value="/roguelike ${skip}">${skipmsg}</button>`;
		buf += `</center></div>`;
		return buf;
	}

	genShopHTML() {
		let buf = `<center><h3>Shop</h3></center><br />`;
		if (this.rotationalShop.length) {
			buf += `<center><strong>Current Deals<strong></center>`;
			if (2 + this.timesRerolled > this.battlePoints) {
				buf += `<button style="float: left;" class="button disabled">Not enough BP!</button>`;
			} else {
				buf += `<button style="float: left;" class="button" name="send" value="/roguelike reroll">Reroll Shop (${2 + this.timesRerolled} BP)</button>`;
			}
			buf += `<br /><br /><table style="width:100%; border-collapse: collapse;"border="1"><tr><th>Item</th><th>Description</th><th>Price</th></tr>`;
			for (const key of this.rotationalShop) {
				const item = ROTATIONAL_ITEM_POOL[key];
				if (item.minStreak > this.streak) continue;
				buf += `<tr><td><img src="https://www.smogon.com/forums/media/minisprites/${itemURLFormat(item.icon)}.png" height=24px width=24px /> ${item.name}</td><td>${item.desc}</td><td>${item.cost} BP</td>`;
				if (item.cost > this.battlePoints) {
					buf += `<td><button class="button disabled">Not enough BP!</button>`;
				} else {
					buf += `<td><button class="button" name="send" value="/roguelike buy ${key}">Purchase</button>`;
				}
				buf += `</tr>`;
			}
			buf += `</table><br />`;
		}
		buf += `<table style="width:100%; border-collapse: collapse;"border="1"><tr><th>Item</th><th>Description</th><th>Price</th></tr>`;
		for (const key in SHOP_ITEMS) {
			const item = SHOP_ITEMS[key];
			if (item.minStreak > this.streak) continue;
			buf += `<tr><td><img src="https://www.smogon.com/forums/media/minisprites/${itemURLFormat(item.icon)}.png" height=24px width=24px /> ${item.name}</td><td>${item.desc}</td><td>${item.cost} BP</td>`;
			if (item.type === 'key' && this.keyItems.includes(item.name)) {
				buf += `<td><button class="button disabled">Already bought!</button>`;
			} else if (item.cost > this.battlePoints) {
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
		case 'pokemonPack':
			exitButtonText = 'Skip';
			buf += `<center><h3>Add a Pokemon!</h3></center><br />`;
			// @ts-expect-error
			buf += this.genMiscTeamHTML(this.flags.pokemonOptions);
			break;
		case 'healHP':
		case 'healPP':
		case 'revive':
		case 'cureStatus':
			buf = `<center>Use this on who?</h3></center><br />`;
			buf += this.genQuickSelectHTML((this.flags.purchasedItem as ShopItem)?.type);
			return buf;
		case 'TM':
			buf = `<center>Teach ${this.flags.moveToLearn} to what Pokemon?</h3></center><br />`;
			buf += this.genQuickSelectHTML((this.flags.purchasedItem as ShopItem)?.type);
			return buf;
		case 'key':
			break;
		case 'itemPack':
			exitButtonText = 'Skip';
			buf += `<center><h3>Get an item!</h3><br />`;
			buf += `<div style="width:100%;">`;
			let itempaddingindex = 0;
			for (const item of this.flags.itemOptions) {
				if (itempaddingindex > 0) buf += `&nbsp;&nbsp;`;
				buf += `<button class="button" name="send" value="/roguelike redeem item, ${toID(item)}"><img src="https://www.smogon.com/forums/media/minisprites/${itemURLFormat(item)}.png" height=24px width=24px />${item}</button>`;
				itempaddingindex++;
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
		buf += `<br /><center><button class="button" name="send" value="/roguelike shop">${exitButtonText}</button></center>`;
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
				// @ts-expect-error
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
	rl.flags.pokemonOptions = genPokemon(3, 5, { midpoint: 315, range: 65, weightcap: 100 }, true);
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
	const currentMainRoom = before.split('-')[0] || before;
	const targetMainRoom = after.split('-')[0] || after;
	if (!currentMainRoom || !targetMainRoom) throw new Error(`Tried to go from ${before} to ${after}!`);
	if (SEQUENCE_CHECK[currentMainRoom].includes(after)) return true;
	if (currentMainRoom === targetMainRoom) return true;
	return false;
}

export const commands: Chat.ChatCommands = {
	extractsave(target, room, user) {
		this.checkCan('console');
		if (!target) return this.parse('/help extractsave');
		const gameData = roguelikeGames.get(toID(target));
		if (gameData) {
			const okey = gameData.user;
			const JSONobj = Object.create(null);
			JSONobj[okey] = {};
			for (const prop in gameData) {
				if (prop === 'flags') {
					JSONobj[okey][prop] = {};
					for (const deepProp in gameData[prop]) {
						JSONobj[okey][prop][deepProp] = gameData[prop][deepProp];
					}
				} else {
					// @ts-expect-error
					JSONobj[okey][prop] = gameData[prop];
				}
			}
			return this.sendReplyBox(JSON.stringify(JSONobj));
		}
		throw new Chat.ErrorMessage(`User not found.`);
	},
	extractsavehelp: [`/extractsave [user] - Gets the user's save data as a JSON, if applicable. Requires: ~`],
	transfer: 'transferdata',
	transferdata(target, room, user) {
		this.checkCan('lock');
		const args = target.split(',');
		if (!target || args.length !== 2) return this.parse('/help transferdata');
		if (user.id === toID(target)) throw new Chat.ErrorMessage(`You are transferring data to the same person!`);
		const oldUser = toID(args[0]);
		const oldUsernameData = roguelikeGames.get(oldUser);
		if (oldUsernameData) {
			const newUser = toID(args[1]);
			let newUsernameData = roguelikeGames.get(newUser);
			if (newUsernameData) {
				newUsernameData = Utils.deepClone(newUsernameData) as Roguelike;
				oldUsernameData.user = newUser;
				roguelikeGames.set(newUser, oldUsernameData);
				newUsernameData.user = oldUser;
				roguelikeGames.set(oldUser, newUsernameData);
			} else {
				oldUsernameData.user = newUser;
				roguelikeGames.set(newUser, oldUsernameData);
				roguelikeGames.delete(oldUser);
			}
			saveRoguelikeData();
			refreshPage(newUser);
			return this.sendReply('Done!');
		}
		throw new Chat.ErrorMessage(`User not found`);
	},
	transferdatahelp: [`/transferdata [old username], [new username] - Transfers a user's data from between usernames. Requires: % @ ~`],
	getteam: 'getrogueliketeam',
	exportteam: 'getrogueliketeam',
	getrogueliketeam(target, room, user) {
		const data = roguelikeGames.get(user.id);
		if (data) {
			const buf = `<b>Your team in the Roguelike (as of now):</b><br /><br />`;
			return this.sendReplyBox(buf + Teams.export(data.team).replaceAll(`\n`, `<br />`));
		}
		throw new Chat.ErrorMessage(`Do you have save data on this account?`);
	},
	getrogueliketeamhelp: [`/transferdata [old username], [new username] - Gives you your team as of your current roguelike save data.`],
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
		top: 'leaderboard',
		lb: 'leaderboard',
		leaderboard(target, room, user) {
			room = this.requireRoom();
			this.runBroadcast();
			let leaderboard = Array.from(roguelikeGames.values());
			leaderboard = leaderboard.sort((a, b) => b.battle - a.battle);

			let buf = `|raw|<div class="ladder"><table><tr><th>Rank</th><th>Player</th><th>Current battle</th><th>Streaks won</th></tr>`;

			for (let x = 0; x < 10; x++) {
				const gamer = leaderboard[x];
				if (!gamer) break;
				buf += `<tr><td>${x + 1}</td><td>${gamer.user}</td><td>${gamer.battle}</td><td>${gamer.streak}</td>`;
			}
			buf += `</table></div>`;
			this.sendReply(buf);
		},
		restart: 'start',
		start(target, room, user, connections, cmd) {
			if (cmd.includes('restart') && user.lastCommand !== 'roguelike restart') {
				user.lastCommand = 'roguelike restart';
				return this.popupReply('Do you really want to restart your run? If so, click the restart button again.');
			}
			createSaveData(user);
			// const newFoe = userData.createAITrainer();
			// createAIBattle(userData.user, newFoe);
			return this.parse(`/join view-roguelike`);
		},
		shop(target, room, user) {
			const userData = roguelikeGames.get(user.id);
			if (!userData || userData.runEnded) throw new Chat.ErrorMessage(`You need to make a new run first.`);
			if (!checkSequence(userData.curRoom, 'shop')) throw new Chat.ErrorMessage(`Can't go to shop yet!`);
			if (userData.flags.purchasedItem) delete userData.flags.purchasedItem;
			userData.goToPage('shop');
		},
		reroll(target, room, user) {
			const userData = roguelikeGames.get(user.id);
			if (!userData || userData.runEnded) throw new Chat.ErrorMessage(`You need to make a new run first.`);
			if (!checkSequence(userData.curRoom, 'shop')) throw new Chat.ErrorMessage(`You aren't in the shop!`);
			const price = 2 + userData.timesRerolled;
			if (price > userData.battlePoints) return this.popupReply(`You don't have enough BP to buy this!`);
			userData.rollShop();
			userData.battlePoints -= price;
			userData.timesRerolled++;
			userData.goToPage('shop');
		},
		checkteam(target, room, user) {
			const userData = roguelikeGames.get(user.id);
			if (!userData || userData.runEnded) throw new Chat.ErrorMessage(`You need to make a new run first.`);
			if (!checkSequence(userData.curRoom, 'shop')) throw new Chat.ErrorMessage(`Can't go here yet!`);
			userData.goToPage('shop-team');
		},
		scout(target, room, user) {
			const userData = roguelikeGames.get(user.id);
			if (!userData || userData.runEnded) throw new Chat.ErrorMessage(`You need to make a new run first.`);
			if (!checkSequence(userData.curRoom, 'shop')) throw new Chat.ErrorMessage(`Can't go here yet!`);
			userData.goToPage('shop-scout');
		},
		scoutslot(target, room, user) {
			const userData = roguelikeGames.get(user.id);
			if (!userData || userData.runEnded) throw new Chat.ErrorMessage(`You need to make a new run first.`);
			if (userData.curRoom !== 'shop-scout') throw new Chat.ErrorMessage(`Can't scout yet!`);
			let index = parseInt(target);
			index--;
			if (userData.flags.opponentTeamScout[index] === undefined) throw new Chat.ErrorMessage(`Slot doesn't exist!`);
			switch (userData.flags.opponentTeamScout[index]) {
			case 'revealMon':
				if (3 > userData.battlePoints) return this.popupReply(`You don't have enough BP to buy this!`);
				userData.flags.opponentTeamScout[index] = 'revealSet';
				userData.battlePoints -= 3;
				break;
			case 'revealSet':
				throw new Chat.ErrorMessage(`You already scouted!`);
				break;
			default:
				if (2 > userData.battlePoints) return this.popupReply(`You don't have enough BP to buy this!`);
				userData.flags.opponentTeamScout[index] = 'revealMon';
				userData.battlePoints -= 2;
				break;
			}
			userData.goToPage('shop-scout');
		},
		buy(target, room, user) {
			const userData = roguelikeGames.get(user.id);
			if (!userData || userData.runEnded) throw new Chat.ErrorMessage(`You need to make a new run first.`);
			if (userData.curRoom !== 'shop') throw new Chat.ErrorMessage(`Can't buy stuff yet!`);
			const item = SHOP_ITEMS[target] || ROTATIONAL_ITEM_POOL[target] || false;
			// if (!item || !userData.rotationalShop.includes(target) || item.minStreak > userData.streak) throw new Chat.ErrorMessage('Does that item even exist?');
			if (item.cost > userData.battlePoints) return this.popupReply(`You don't have enough BP to buy this!`);
			switch (item.type) {
			case 'key':
				userData.keyItems.push(item.name);
				userData.battlePoints -= item.cost;
				userData.goToPage('shop');
				return;
			case 'pokemonPack':
				const scale = [5, 10];
				scale.forEach((e, i) => scale[i] = Utils.clampIntRange(e + (userData.streak * 5), 1, 100));
				const weighting = { range: 0, midpoint: 0, weightcap: 0 } as PokePackWeighting;
				switch (item.name) {
				case 'Poke Ball Pack':
					weighting.range = 100;
					weighting.midpoint = 263;
					weighting.weightcap = 100;
					break;
				case 'Great Ball Pack':
					weighting.range = 35;
					weighting.midpoint = 450;
					weighting.weightcap = 100;
					break;
				case 'Ultra Ball Pack':
					weighting.range = 30;
					weighting.midpoint = 540;
					weighting.weightcap = 100;
					break;
				case 'Master Ball Pack':
					weighting.range = 50;
					weighting.midpoint = 640;
					weighting.weightcap = 100;
					break;
				}
				if (weighting.range > 0) {
					userData.flags.pokemonOptions = genPokemon(3, scale, weighting);
				} else {
					userData.flags.pokemonOptions = genPokemon(3, scale);
				}
				userData.battlePoints -= item.cost;
				break;
			case 'itemPack':
				userData.flags.itemOptions = genItem(3, userData.team);
				userData.battlePoints -= item.cost;
				break;
			case 'item':
				userData.flags.newItem = item.name;
				userData.flags.isRotationalItem = true;
				userData.flags.purchasedItem = item;
				userData.goToPage('purchase-item');
				return;
			case 'TM':
				userData.flags.moveToLearn = item.move;
				userData.flags.isRotationalItem = true;
				userData.flags.purchasedItem = item;
			case 'healHP':
			case 'healPP':
			case 'revive':
			case 'cureStatus':
			case 'debug':
			}
			userData.flags.purchasedItem = item;
			userData.goToPage('purchase');
		},
		addstarter(target, room, user) {
			const userData = roguelikeGames.get(user.id);
			if (!userData || userData.runEnded) throw new Chat.ErrorMessage(`You need to make a new run first.`);
			if (!userData.flags.pokemonOptions) throw new Chat.ErrorMessage(`No Pokemon to add.`);
			if (userData.curRoom !== 'intro') throw new Chat.ErrorMessage(`You already have a starter.`);
			const pokes = userData.flags.pokemonOptions;
			const poke = pokes.find(p => toID(p.species) === toID(target));
			if (!poke) throw new Chat.ErrorMessage(`You can't choose that pokemon.`);
			let pokeIndex = pokes.indexOf(poke);
			pokeIndex = (pokeIndex + 1) > 2 ? 0 : pokeIndex + 1;
			if (userData.team.length >= 6) {
				// TODO: Figure out releasing pokemon.
			} else {
				userData.addPokemon(poke);
			}
			userData.opponentTeam = [];
			userData.opponentTeam.push(userData.flags.pokemonOptions[pokeIndex]);
			delete userData.flags.pokemonOptions;
			const newFoe = userData.createAITrainer();
			createAIBattle(userData.user, newFoe);
		},
		redeem(target, room, user) {
			let index: number;
			const userData = roguelikeGames.get(user.id);
			if (!userData || userData.runEnded) throw new Chat.ErrorMessage(`You need to make a new run first.`);
			if (!userData.flags.purchasedItem) throw new Chat.ErrorMessage(`You need to purchase something first.`);
			const args = target.split(',');
			let arg = args.shift();
			switch (arg) {
			case 'pokemon':
				if (!userData.flags.pokemonOptions) throw new Chat.ErrorMessage(`No Pokemon to add.`);
				arg = args.shift();
				if (!arg) throw new Chat.ErrorMessage(`You need to specify a pokemon.`);
				const pokes = userData.flags.pokemonOptions;
				const poke = pokes.find(p => toID(p.species) === toID(arg));
				if (!poke) throw new Chat.ErrorMessage(`You can't choose that pokemon.`);
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
				if (!arg) throw new Chat.ErrorMessage(`You need to specify a pokemon.`);
				index = parseInt(arg);
				index--;
				if (!userData.team[index]) throw new Chat.ErrorMessage(`You need to specify a pokemon on your team.`);
				if (userData.teamData[index].curHP === userData.teamData[index].maxHP) throw new Chat.ErrorMessage(`You can't use this on that pokemon.`);

				userData.battlePoints -= (userData.flags.purchasedItem as ShopItem).cost;
				switch ((userData.flags.purchasedItem as ShopItem).name) {
				case 'Potion':
					userData.teamData[index].curHP = Utils.clampIntRange(userData.teamData[index].curHP + 20, 1, userData.teamData[index].maxHP);
					break;
				case 'Super Potion':
					userData.teamData[index].curHP = Utils.clampIntRange(userData.teamData[index].curHP + 50, 1, userData.teamData[index].maxHP);
					break;
				case 'Hyper Potion':
					userData.teamData[index].curHP = Utils.clampIntRange(userData.teamData[index].curHP + 120, 1, userData.teamData[index].maxHP);
					break;
				case 'Max Potion':
					userData.teamData[index].curHP = userData.teamData[index].maxHP;
					break;
				}
				break;
			case 'healpp':
				arg = args.shift();
				if (!arg) throw new Chat.ErrorMessage(`You need to specify a pokemon.`);
				index = parseInt(arg);
				index--;
				if (!userData.team[index]) throw new Chat.ErrorMessage(`You need to specify a pokemon on your team.`);
				if (userData.teamData[index].ppLeft.every((v, i) => Dex.moves.get(userData.team[index].moves[i]).pp * (8 / 5) === v)) throw new Chat.ErrorMessage(`You can't use this on that pokemon.`);
				userData.teamData[index].ppLeft.forEach((v, i) => userData.teamData[index].ppLeft[i] = Dex.moves.get(userData.team[index].moves[i]).pp * (8 / 5));
				userData.battlePoints -= (userData.flags.purchasedItem as ShopItem).cost;
				// TODO: More items
				break;
			case 'curestatus':
				arg = args.shift();
				if (!arg) throw new Chat.ErrorMessage(`You need to specify a pokemon.`);
				index = parseInt(arg);
				index--;
				if (!userData.team[index]) throw new Chat.ErrorMessage(`You need to specify a pokemon on your team.`);
				if (!userData.teamData[index].status || userData.teamData[index].status === 'fnt') throw new Chat.ErrorMessage(`You can't use this on that pokemon.`);
				userData.teamData[index].status = false;
				userData.battlePoints -= (userData.flags.purchasedItem as ShopItem).cost;
				// TODO: More items
				break;
			case 'revive':
				arg = args.shift();
				if (!arg) throw new Chat.ErrorMessage(`You need to specify a pokemon.`);
				index = parseInt(arg);
				index--;
				if (!userData.team[index]) throw new Chat.ErrorMessage(`You need to specify a pokemon on your team.`);
				if (userData.teamData[index].status !== 'fnt') throw new Chat.ErrorMessage(`You can't use this on that pokemon.`);
				userData.teamData[index].curHP = userData.team[index].species === 'Shedinja' ? userData.teamData[index].maxHP : Math.floor(userData.teamData[index].maxHP / 2);
				userData.teamData[index].status = false;
				userData.battlePoints -= (userData.flags.purchasedItem as ShopItem).cost;
				// TODO: More items
				break;
			case 'item':
				arg = args.shift();
				if (!arg) throw new Chat.ErrorMessage(`You need to specify an item.`);
				const dexItem = Dex.items.get(arg);
				if (!dexItem) throw new Chat.ErrorMessage(`You need to specify an item.`);
				userData.flags.newItem = dexItem.name;
				userData.goToPage('purchase-item');
				delete userData.flags.itemOptions;
				return;
			case 'tm':
				arg = args.shift();
				if (!arg) throw new Chat.ErrorMessage(`You need to specify a pokemon.`);
				index = parseInt(arg);
				index--;
				if (!userData.team[index]) throw new Chat.ErrorMessage(`You need to specify a pokemon on your team.`);
				if (!getMovesAtTarget(userData.team[index].species, 'any').includes(toID(userData.flags.moveToLearn)) || userData.team[index].moves.includes(userData.flags.moveToLearn)) throw new Chat.ErrorMessage(`You can't use this on that pokemon.`);
				userData.flags.pokemonForTM = index;
				if (userData.team[index].moves.length >= 4) {
					userData.goToPage('forgetmove');
				} else {
					userData.team[index].moves.push(userData.flags.moveToLearn);
					userData.teamData[index].ppLeft.push(Dex.moves.get(userData.flags.moveToLearn).pp * (8 / 5));
					userData.goToPage('forgetmove-done');
				}
				return;
			default:
				throw new Chat.ErrorMessage(`Your command is too vague.`);
			}
			if (userData.flags.purchasedItem) delete userData.flags.purchasedItem;
			userData.goToPage('shop');
		},
		learnmove(target, room, user) {
			const userData = roguelikeGames.get(user.id);
			if (!userData || userData.runEnded) throw new Chat.ErrorMessage(`You need to make a new run first.`);
			if (!target) throw new Chat.ErrorMessage(`You need to specify a move to forget!`);
			if (target === 'done') {
				delete userData.flags.pokemonForTM;
				delete userData.flags.moveToLearn;
				if (userData.curRoom.endsWith(`-done`)) {
					delete userData.flags.moveForgotten;
					if (userData.flags.isRotationalItem) {
						const TMName = userData.flags.purchasedItem.name.substring(0, 5);
						userData.rotationalShop.splice(userData.rotationalShop.indexOf(toID(TMName)), 1);
						delete userData.flags.isRotationalItem;
					}
					if (userData.flags.purchasedItem) {
						userData.battlePoints -= (userData.flags.purchasedItem as ShopItem).cost;
						delete userData.flags.purchasedItem;
					}
				}
				userData.goToPage('shop');
				return;
			}
			const index = parseInt(target);
			if (userData.flags.pokemonForTM === undefined || !userData.flags.moveToLearn) throw new Chat.ErrorMessage(`You need to have a Pokemon learning a move!`);
			const teamIndex = userData.flags.pokemonForTM;
			userData.flags.moveForgotten = userData.team[teamIndex].moves[index];
			userData.team[teamIndex].moves[index] = userData.flags.moveToLearn;
			userData.teamData[teamIndex].ppLeft[index] = Dex.moves.get(userData.flags.moveToLearn).pp * (8 / 5);
			userData.goToPage('forgetmove-done');
		},
		replacepoke(target, room, user) {
			const userData = roguelikeGames.get(user.id);
			if (!userData || userData.runEnded) throw new Chat.ErrorMessage(`You need to make a new run first.`);
			if (!userData.flags.replacingWith) throw new Chat.ErrorMessage(`You need to purchase something first.`);
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
		evolution(target, room, user) {
			const userData = roguelikeGames.get(user.id);
			if (!userData || userData.runEnded) throw new Chat.ErrorMessage(`You need to make a new run first.`);
			if (!target) throw new Chat.ErrorMessage(`You need to specify a decision!`);
			const args = target.split(',');
			const choice = args.shift()?.trim().toLowerCase();
			if (choice === 'continue') {
				if (!userData.curRoom.includes('success')) throw new Chat.ErrorMessage(`You can't use that command yet!`);
				delete userData.flags.prevoName;
				if (userData.teamData.some(t => !!t.evoFlag)) {
					userData.goToPage('evolution');
				} else {
					userData.goToPage('results');
				}
				return;
			}
			if (!args.length) throw new Chat.ErrorMessage(`You need to specify a decision!`);
			const index = parseInt(args.shift());
			if (index === undefined) throw new Chat.ErrorMessage(`You need to specify a decision!`);
			const evolvedForm = userData.teamData[index].evoFlag;
			if (!evolvedForm) throw new Chat.ErrorMessage(`This Pokemon can't evolve yet!`);
			if (choice === 'accept') {
				// TODO: Pupitar
				const abilPool = Object.values(Dex.species.get(userData.team[index].species).abilities).indexOf(userData.team[index].ability);
				if (abilPool >= 0) userData.team[index].ability = Object.values(Dex.species.get(evolvedForm).abilities)[abilPool];
				userData.team[index].species = evolvedForm;
				userData.flags.prevoName = userData.team[index].name;
				userData.team[index].name = evolvedForm;
				userData.teamData[index].evoFlag = false;
				userData.goToPage(`evolution-success-${index}`);
				return;
			} else if (choice === 'reject') {
				userData.teamData[index].evoFlag = false;
				if (userData.teamData.some(t => !!t.evoFlag)) {
					userData.goToPage('evolution');
				} else {
					userData.goToPage('results');
				}
				return;
			}
			throw new Chat.ErrorMessage(`You need to specify a decision!`);
		},
		switch(target, room, user) {
			const userData = roguelikeGames.get(user.id);
			if (!userData || userData.runEnded) throw new Chat.ErrorMessage(`You need to make a new run first.`);
			if (target === 'undo') {
				userData.goToPage('shop-team');
			}
			const args = target.split(',');
			let arg = args.shift();
			if (!arg) throw new Chat.ErrorMessage(`You need to specify a pokemon to switch with!`);
			let index1 = parseInt(arg);
			if (!index1) throw new Chat.ErrorMessage(`You need to specify a pokemon to switch with!`);
			if (!userData.team[index1 - 1]) throw new Chat.ErrorMessage(`You need to specify a pokemon to switch with!`);
			arg = args.shift();
			if (!arg) {
				userData.goToPage(`shop-switch-${index1}`);
				return;
			} else {
				let index2 = parseInt(arg);
				if (!index2) throw new Chat.ErrorMessage(`You need to specify a pokemon to switch with!`);
				index1--;
				index2--;
				if (!userData.team[index1] || !userData.team[index2]) throw new Chat.ErrorMessage(`You need to specify a pokemon to switch with!`);
				const carrySet = userData.team[index1];
				const carryData = userData.teamData[index1];
				userData.team[index1] = userData.team[index2];
				userData.teamData[index1] = userData.teamData[index2];
				userData.teamData[index1].linkedTeamIndex = index1;
				userData.team[index2] = carrySet;
				userData.teamData[index2] = carryData;
				userData.teamData[index2].linkedTeamIndex = index2;
				userData.goToPage('shop-team');
			}
		},
		giveitem(target, room, user) {
			const userData = roguelikeGames.get(user.id);
			if (!userData || userData.runEnded) throw new Chat.ErrorMessage(`You need to make a new run first.`);
			if (!userData.flags.newItem) throw new Chat.ErrorMessage(`You need to purchase something first.`);
			if (target === 'skip') {
				delete userData.flags.newItem;
				if (userData.flags.purchasedItem) delete userData.flags.purchasedItem;
				if (userData.flags.isRotationalItem) delete userData.flags.isRotationalItem;
				userData.goToPage('shop');
				return;
			}
			const index = parseInt(target);
			if (index && index <= 6) {
				if (userData.flags.isRotationalItem) {
					userData.battlePoints -= ROTATIONAL_ITEM_POOL[toID(userData.flags.newItem)].cost;
					userData.rotationalShop.splice(userData.rotationalShop.indexOf(toID(userData.flags.newItem)), 1);
					delete userData.flags.isRotationalItem;
				}
				const dexNewItem = Dex.items.get(userData.flags.newItem);
				const dexOldItem = Dex.items.get(userData.team[index - 1].item);
				const dexSpecies = Dex.species.get(userData.team[index - 1].species);
				if (dexNewItem.forcedForme && dexSpecies.otherFormes?.includes(dexNewItem.forcedForme)) {
					userData.team[index - 1].species = dexNewItem.forcedForme;
					userData.team[index - 1].ability = Dex.species.get(dexNewItem.forcedForme).abilities[0];
				} else if (dexOldItem.forcedForme && dexSpecies.otherFormes?.includes(dexOldItem.forcedForme)) {
					userData.team[index - 1].species = dexSpecies.changesFrom!; // Should always be possible
					userData.team[index - 1].ability = Dex.species.get(dexSpecies.changesFrom).abilities[0];
				}
				userData.team[index - 1].item = userData.flags.newItem;
				delete userData.flags.newItem;
				if (userData.flags.purchasedItem) delete userData.flags.purchasedItem;
			}
			userData.goToPage('shop');
		},
		next(target, room, user) {
			const userData = roguelikeGames.get(user.id);
			if (!userData || userData.runEnded) throw new Chat.ErrorMessage(`You need to make a new run first.`);
			if (!checkSequence(userData.curRoom, 'battle') || userData.inBattle) throw new Chat.ErrorMessage(`Can't battle yet!`);
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
			let buf = `<div class = "pad"><center>`;
			buf += `Hello, I am <username>HiZo</username>, and welcome to my Roguelike. It is based on a combination of Balatro and the Gen 4 Battle Castle. You just gotta keep winning fights, get new Pokemon, and try for a high score!<br /><br />`;
			buf += `However, keep in mind this game is STILL in <strong>Alpha</strong>, which means that: there may be bugs, there are features that may not be present compared to a real Pokemon (fan)game, and there could be updates which might break your save file and I may need to remove your current run in the event that happens.<br /><br />`;
			buf += `If there are bugs you encounter, please let me know. Best ways to contact me are on Smogon (HiZo), Pokemon Showdown (HiZo or Misao) or Discord (hisuianzoroark).<br /><br />`;
			buf += `Special thanks to <username>HoeenHero</username> for tech support and <username>Swagn</username>, <username>Smudge</username>, <username>April</username>, <username>Lumii</username>, <username>Clas</username>, and a LOT of other people who made me motivated to keep working on this.<br /><br />`;
			buf += `Now without further ado...<br /><br />`;
			buf += `<button class="button" name="send" value="/roguelike start">Start a run!</button></center>`;
			buf += `</center></div>`;
			return buf;
		}
		const gameArgs = userGameData.curRoom.split('-');
		const mainRoomArg = gameArgs.shift();
		let subtitle = '';
		let buf = `<div class = "pad">`;
		if ((mainRoomArg !== 'battle' && mainRoomArg !== 'intro') && !userGameData.runEnded) {
			// just type /forfeit
			buf += `<button style="float: right;" class="button" name="send" value="/roguelike restart">Restart</button><br />`;
		}
		switch (mainRoomArg) {
		case 'battle':
			if (userGameData.inBattle) {
				this.title = '[Roguelike] Currently in battle';
				throw new Chat.ErrorMessage('You are currently in battle!');
			} else {
				buf += `<center>Something went wrong, please try again.`;
				buf += `<br /><br /><button class="button" name="send" value="/roguelike next">Redo Battle</button></center>`;
			}
			break;
		case 'results':
			if (userGameData.runEnded) {
				subtitle = 'Game Over';
				buf += `<center><h3>Too bad!</h3><br />`;
				buf += `<b>Matches won:</b> ${userGameData.battle - 1}<br /><b>Streaks Won:</b> ${userGameData.streak}<br /><b>BP:</b> ${userGameData.battlePoints}`;
				buf += `<br /><br /><button class="button" name="send" value="/roguelike start">Start a new run</button></center>`;
			} else {
				if (userGameData.streak === 8 && (userGameData.battle - 1) % 7 === 0) {
					subtitle = 'You won!';
					buf += `<center><h3>Congratulations, you completed the run!</h3><br />`;
					buf += `<b>Matches won:</b> ${userGameData.battle - 1}<br /><b>Streaks Won:</b> ${userGameData.streak}<br /><b>BP:</b> ${userGameData.battlePoints}`;
					buf += `<br /><br /><button class="button" name="send" value="/roguelike shop">Keep going</button><br />`;
					buf += `<br /><button class="button" name="send" value="/roguelike start">Start a new run</button></center>`;
				} else {
					subtitle = 'Current Run Info';
					buf += `<center><h3>Nice win!</h3><br />`;
					buf += `<b>Current match:</b> ${userGameData.battle}<br /><b>Streaks won:</b> ${userGameData.streak}<br /><b>BP:</b> ${userGameData.battlePoints}<br />(+5 BP for winning)`;
					if ((userGameData.battle - 1) % 7 === 0) {
						buf += `<br />(+5 BP for completing a streak)<br />(Also, your Pokemon are fully healed)`;
					}
					buf += `<br /><br /><button class="button" name="send" value="/roguelike shop">Go to shop</button></center>`;
				}
			}
			break;
		case 'shop':
			buf += `<b>Current match:</b> ${(userGameData.battle % 7 === 0 ? 7 : userGameData.battle % 7)}/7 | <b>Current Streak:</b> ${userGameData.streak + 1}/8 | <b>BP:</b> ${userGameData.battlePoints}<br /><br />`;
			switch (gameArgs.shift()) {
			case 'team':
				subtitle = 'Current Team';
				buf += `<button class="button" name="send" value="/roguelike shop">Go back to shop</button>`;
				buf += userGameData.genUserTeamHTML();
				break;
			case 'scout':
				subtitle = 'Scouting Opponent';
				buf += `<button class="button" name="send" value="/roguelike shop">Go back to shop</button><br />`;
				buf += `<center><h3>Opponent's team</h3><br />`;
				buf += userGameData.genScoutHTML();
				break;
			case 'switch':
				subtitle = 'Current Team';
				const switchIndex = gameArgs.shift();
				if (!switchIndex) throw new Chat.ErrorMessage('If you tried to switch and reached this error, contact HiZo.');
				buf = `<center>Switch with who?</center><br />`;
				const switchNumber = parseInt(switchIndex);
				buf += userGameData.genQuickSelectHTML('switch', switchNumber);
				break;
			default:
				subtitle = 'Shop';
				buf += `<button class="button" name="send" value="/roguelike checkteam">Check your team</button>`;
				buf += `<button class="button" style="float: right;" name="send" value="/roguelike scout">Scout your next opponent</button>`;
				buf += userGameData.genShopHTML();
				buf += `<br /><center><button class="button" name="send" value="/roguelike next">Start the next battle!</button></center>`;
			}
			break;
		case 'purchase':
			if (!userGameData.flags.purchasedItem) {
				this.title = '[Roguelike] Purchase Error';
				throw new Chat.ErrorMessage('If you tried to purchased something and reached this error, contact HiZo.');
			}
			subtitle = 'Complete Purchase';
			switch (gameArgs.shift()) {
			case 'release':
				buf = `<center>Choose a pokemon to replace!</center><br />`;
				buf += userGameData.genQuickSelectHTML('pokemonPack');
				break;
			case 'item':
				buf = `<center>Give this item to who?</center><br />`;
				const type = userGameData.flags.purchasedItem?.type || 'itemPack';
				buf += userGameData.genQuickSelectHTML(type);
				break;
			default:
				buf += userGameData.genPurchaseHTML();
			}
			break;
		case 'intro':
			subtitle = 'Pick a Starter';
			if (!userGameData.flags.pokemonOptions) {
				this.title = '[Roguelike] Error';
				throw new Chat.ErrorMessage('If you reached this error, you either already picked a starter or should contact HiZo.');
			}
			buf += `<center><h3>Choose a starter!</h3><br />`;
			// @ts-expect-error
			buf += userGameData.genMiscTeamHTML(userGameData.flags.pokemonOptions, 'starter');
			break;
		case 'forgetmove':
			subtitle = 'Forget a move';
			const relevantMoveLearner = userGameData.team[userGameData.flags.pokemonForTM];
			if (gameArgs.shift() === 'done') {
				const forgotblurb = userGameData.flags.moveForgotten ? `forgot ${userGameData.flags.moveForgotten} and ` : ``;
				buf += `<center><h3>Your ${relevantMoveLearner.name} ${forgotblurb}learned ${userGameData.flags.moveToLearn}!</h3><br />`;
				buf += `<psicon pokemon=${relevantMoveLearner.species}><br /><br />`;
				buf += `<button class="button" name="send" value="/roguelike learnmove done">Go back to shop</button></center>`;
			} else {
				buf = `<center><psicon pokemon=${relevantMoveLearner.species}>Choose a move to forget to make room for ${userGameData.flags.moveToLearn}!</center><br />`;
				buf += userGameData.genMoveSelectHTML(relevantMoveLearner);
			}
			break;
		case 'evolution':
			subtitle = 'Evolution';
			if (gameArgs.shift() === 'success') {
				const justEvolvedIndex = parseInt(gameArgs.shift());
				const justEvolved = userGameData.team[justEvolvedIndex];
				buf += `<center><h3>Your ${userGameData.flags.prevoName} evolved into ${justEvolved.name}!</h3><br />`;
				buf += `<psicon pokemon=${justEvolved.species}><br /><br />`;
				buf += `<button class="button" name="send" value="/roguelike evolution continue,">Continue</button></center>`;
			} else {
				const evolutionFlag = userGameData.teamData.find(t => !!t.evoFlag);
				if (!evolutionFlag) {
					this.title = '[Roguelike] Error';
					throw new Chat.ErrorMessage('If you reached this error, you should contact HiZo.');
				}
				const evolvingPokemon = userGameData.team[evolutionFlag.linkedTeamIndex];
				buf += `<center><h3>Do you want your ${evolvingPokemon.name} to evolve into ${evolutionFlag.evoFlag}?</h3><br />`;
				buf += `<psicon pokemon=${evolvingPokemon.species}><br /><br />`;
				buf += `<button class="button" name="send" value="/roguelike evolution accept, ${evolutionFlag.linkedTeamIndex}">Yes</button>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<button class="button" name="send" value="/roguelike evolution reject, ${evolutionFlag.linkedTeamIndex}">No</button></center>`;
			}
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
			if (humanGameData.teamData.every(poke => poke.status === 'fnt')) {
				if (humanGameData.battle % 7 === 0) {
					humanGameData.streak++;
				}
				humanGameData.battle++;
				humanGameData.lose();
			} else {
				humanGameData.win();
			}
		} else {
			humanGameData.lose();
		}
		if (humanGameData.teamData.some(poke => !!poke.evoFlag)) {
			humanGameData.goToPage('evolution');
		} else {
			humanGameData.goToPage('results');
		}
	},

	onAbandondedBattleDestroy(battle, players) {
		if (!battle.options.isRoguelikeBattle) return;
		// Player 1 is the always the human
		const human = players[0];
		const humanGameData = roguelikeGames.get(human);
		if (!humanGameData) return;
		humanGameData.lose();
		humanGameData.goToPage('results');
	},

	onRename(user, oldID, newID) {
		const humanGameData = roguelikeGames.get(oldID);
		if (humanGameData?.inBattle) {
			humanGameData.lose();
			humanGameData.goToPage('results');
		}
		refreshPage(user.id);
	},
};

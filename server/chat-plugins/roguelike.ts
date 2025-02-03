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

export const commands: Chat.ChatCommands = {

	testcmd(target, room, user) {
		// @ts-ignore
		createAIBattle(user);
	},
};

export const pages: Chat.PageTable = {

};

export const handlers: Chat.Handlers = {
	onBattleEnd(battle, winner, players) {
		if (!battle.options.isRoguelikeBattle) return;
		console.log(winner);
	},
};

interface AITrainer {
	name: string;
	team?: PokemonSet[];
}

function createAIBattle(user: User, ai: AITrainer) {
	Rooms.createBattle({
		format: 'gen9randombattle',
		players: [{
			user: user,
			// @ts-ignore
		}, {
			username: ai.name,
			team: ai.team,
			isAI: true,
		}],
	});
}

export function roguelikeAI() {
	return 'default';
}

export const commands: Chat.ChatCommands = {

	testcmd(target, room, user) {
		let ai = {name: 'test', team: ''};
		createAIBattle(user, ai);
	},
};

export const pages: Chat.PageTable = {

};



export function roguelikeAI() {
	return 'default';
};

export const commands: Chat.ChatCommands = {

	testcmd(target, room, user) {
		Rooms.createBattle({
			format: 'gen9randombattle',
			players: [{
				user: user,
				// @ts-ignore
			}, {
				username: 'test',
				isAI: true,
			}],
		});
	},
};

export const pages: Chat.PageTable = {

};

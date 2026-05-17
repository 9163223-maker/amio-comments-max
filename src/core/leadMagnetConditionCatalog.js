'use strict';

const RUNTIME = 'ADMINKIT-CORE-LEAD-CONDITION-CATALOG-1.34-MAX-CAPABILITIES';

const CONDITIONS = Object.freeze([
  {
    id: 'subscribe_current_channel',
    title: 'Подписан на текущий канал',
    icon: '✅',
    accessMode: 'subscribers_current_channel',
    verifier: 'max_channel_membership',
    description: 'Подарок выдаётся, если пользователь подписан на канал, к которому привязан пост.'
  },
  {
    id: 'subscribe_one_channel',
    title: 'Подписан на один выбранный канал',
    icon: '📡',
    accessMode: 'subscribe_one_channel',
    verifier: 'max_channel_membership',
    needs: ['channelId'],
    description: 'Администратор выбирает канал; пользователь должен быть его подписчиком.'
  },
  {
    id: 'subscribe_many_channels',
    title: 'Подписан на несколько каналов',
    icon: '📚',
    accessMode: 'subscribe_many_channels',
    verifier: 'max_channel_membership_many',
    needs: ['channelIds'],
    description: 'Проверка подписки сразу на несколько каналов. Для воронок и партнёрских механик.'
  },
  {
    id: 'comment_on_post',
    title: 'Оставил комментарий под постом',
    icon: '💬',
    accessMode: 'comment_on_post',
    verifier: 'core_comment_registry',
    needs: ['postId'],
    description: 'Пользователь должен оставить хотя бы один комментарий под выбранным постом.'
  },
  {
    id: 'comment_count_on_post',
    title: 'Оставил N комментариев под постом',
    icon: '🔢',
    accessMode: 'comment_count_on_post',
    verifier: 'core_comment_registry',
    needs: ['postId', 'minComments'],
    description: 'Например: оставить 2 комментария под конкретным постом.'
  },
  {
    id: 'comment_keyword',
    title: 'Написал фразу/кодовое слово в комментариях',
    icon: '🔑',
    accessMode: 'comment_keyword',
    verifier: 'core_comment_registry_keyword',
    needs: ['postId', 'keyword'],
    description: 'Например: “хочу купить капсулу”, “хочу гайд”, “промокод”.'
  },
  {
    id: 'reaction_on_post',
    title: 'Поставил реакцию на пост',
    icon: '❤️',
    accessMode: 'reaction_on_post',
    verifier: 'max_or_core_reaction_registry',
    needs: ['postId'],
    description: 'Пользователь должен поставить реакцию на выбранный пост, если событие/данные доступны.'
  },
  {
    id: 'reaction_count_on_post',
    title: 'Поставил N реакций / набрал реакцию',
    icon: '🔥',
    accessMode: 'reaction_count_on_post',
    verifier: 'max_or_core_reaction_registry',
    needs: ['postId', 'minReactions'],
    description: 'Условие на количество реакций, если MAX/собственный registry позволяют это проверить.'
  },
  {
    id: 'quiz_answer',
    title: 'Ответил на квиз / опрос',
    icon: '🧩',
    accessMode: 'quiz_answer',
    verifier: 'core_poll_registry',
    needs: ['pollId'],
    description: 'Пользователь должен ответить на квиз или голосование, созданное через Core.'
  },
  {
    id: 'quiz_correct_answer',
    title: 'Ответил правильно на квиз',
    icon: '🎯',
    accessMode: 'quiz_correct_answer',
    verifier: 'core_poll_registry',
    needs: ['pollId', 'answerId'],
    description: 'Подарок выдаётся только за конкретный правильный ответ.'
  },
  {
    id: 'all_conditions',
    title: 'Выполнил все условия',
    icon: '🧱',
    accessMode: 'all_conditions',
    verifier: 'condition_composer_all',
    needs: ['conditions'],
    description: 'Комбинация: например, подписка + комментарий + реакция.'
  },
  {
    id: 'any_condition',
    title: 'Выполнил любое из условий',
    icon: '🔀',
    accessMode: 'any_condition',
    verifier: 'condition_composer_any',
    needs: ['conditions'],
    description: 'Гибкая выдача: достаточно выполнить одно из условий.'
  }
]);

function list() { return CONDITIONS.slice(); }
function find(idOrMode = '') { return CONDITIONS.find((item) => item.id === idOrMode || item.accessMode === idOrMode) || null; }
function publicButtons() {
  return CONDITIONS.filter((item) => !['all_conditions', 'any_condition'].includes(item.id)).map((item) => ({
    text: `${item.icon} ${item.title}`,
    route: 'flow.select_access',
    data: { flowId: 'lead_magnets.create', conditionId: item.id, accessMode: item.accessMode, accessLabel: item.title, verifier: item.verifier }
  }));
}
function toCondition(input = {}) {
  const item = find(input.conditionId || input.accessMode || input.mode) || find('subscribe_current_channel');
  return {
    id: item.id,
    mode: item.accessMode,
    title: item.title,
    verifier: item.verifier,
    needs: item.needs || [],
    params: input.params || {},
    source: 'adminkit-core-condition-catalog'
  };
}
function selfTest() {
  const ids = CONDITIONS.map((x) => x.id);
  return {
    ok: ids.includes('subscribe_many_channels') && ids.includes('comment_keyword') && ids.includes('quiz_answer') && ids.includes('reaction_on_post'),
    runtimeVersion: RUNTIME,
    count: CONDITIONS.length,
    supports: ids,
    maxApiBacked: ['subscribe_current_channel', 'subscribe_one_channel', 'subscribe_many_channels'],
    coreRegistryBacked: ['comment_on_post', 'comment_count_on_post', 'comment_keyword', 'quiz_answer', 'quiz_correct_answer'],
    reactionRegistryBacked: ['reaction_on_post', 'reaction_count_on_post'],
    combinators: ['all_conditions', 'any_condition']
  };
}

module.exports = { RUNTIME, CONDITIONS, list, find, publicButtons, toCondition, selfTest };

import test from 'node:test';
import assert from 'node:assert/strict';
import { eventContent } from '../lib/discovery/events.ts';

const legacy = 'Apresentação\n\nSegundo parágrafo\n\nFormato: Mostra literária\n\nParticipação: Obras existentes ou inéditas\n\nInscrições por autor: Ilimitadas\n\nComo participar:\nPrimeiro passo.\n\nSegundo passo.\n\nRegras:\n1. Primeira regra.\n2. Segunda regra.';

test('legacy event content opens in editable sections and keeps paragraphs', () => {
  for (const description of [legacy, legacy.replaceAll('\n', '\\n')]) {
    const result = eventContent({ description, details: null });
    assert.equal(result.description, 'Apresentação\n\nSegundo parágrafo');
    assert.equal(result.format, 'Mostra literária');
    assert.equal(result.entry_limit, 'Ilimitadas');
    assert.equal(result.instructions, 'Primeiro passo.\n\nSegundo passo.');
    assert.equal(result.rules, '1. Primeira regra.\n2. Segunda regra.');
  }
});

test('plain descriptions and independently saved sections stay intact', () => {
  const description = 'Evento antigo\n\nFormato: um encontro informal.';
  assert.equal(eventContent({ description, details: null }).description, description);
  assert.equal(eventContent({ description: legacy, details: { rules: 'Regra nova' } }).description, legacy);
});

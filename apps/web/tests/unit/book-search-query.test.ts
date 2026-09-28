import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildBookSearchQuery, cleanBookTitle } from '@/lib/utils/search-query';

describe('buildBookSearchQuery', () => {
  it('drops the series and volume a catalogue title carries', () => {
    assert.equal(
      buildBookSearchQuery("The Mercy of Gods: Captive's War, Book 1", 'James S. A. Corey'),
      'The Mercy of Gods James S. A. Corey'
    );
  });

  it('strips a volume clause with no subtitle colon', () => {
    assert.equal(cleanBookTitle('Wheel of Time Vol. 3'), 'Wheel of Time');
    assert.equal(cleanBookTitle('Skyward #2'), 'Skyward');
  });

  it('strips bracketed asides and stray punctuation', () => {
    assert.equal(cleanBookTitle('Dune (Unabridged) [Deluxe Edition]'), 'Dune');
    assert.equal(cleanBookTitle("Harry Potter & the Sorcerer's Stone"), "Harry Potter the Sorcerer's Stone");
  });

  it('falls back to the raw title when cleaning leaves nothing', () => {
    assert.equal(cleanBookTitle(': A Novel'), ': A Novel');
  });

  it('works without an author', () => {
    assert.equal(buildBookSearchQuery('Dune: Book One', null), 'Dune');
  });
});

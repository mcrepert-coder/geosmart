import { rowsOf } from './sql-runner';

describe('rowsOf', () => {
  it('lit les lignes renvoyees par PGlite', () => {
    expect(rowsOf({ rows: [{ id: 'v1' }] })).toEqual([{ id: 'v1' }]);
  });

  it('lit les lignes renvoyees par un SELECT', () => {
    expect(rowsOf([{ id: 'v1' }])).toEqual([{ id: 'v1' }]);
  });

  it('déplie le tuple [lignes, nombre] des UPDATE/DELETE de TypeORM', () => {
    expect(rowsOf([[{ id: 'v1' }], 1])).toEqual([{ id: 'v1' }]);
    expect(rowsOf([[], 0])).toEqual([]);
  });
});

import ColumnCompiler from 'knex/lib/schema/columncompiler';

// Column Compiler
// -------

class ColumnCompiler_Firebird extends ColumnCompiler {
  modifiers = [ 'collate', 'nullable' ];
  increments = 'integer not null primary key';

  collate(collation) {
    // TODO request `charset` modifier of knex column
    return collation && `character set ${collation|| 'ASCII'}`
  }
}

export default ColumnCompiler_Firebird;

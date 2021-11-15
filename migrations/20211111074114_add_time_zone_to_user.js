exports.up = (knex) => knex.schema.table('users', (table) => {
  table.text('timezone');
});

exports.down = (knex) => knex.schema.table('users', (table) => {
  table.dropColumns(['timezone']);
});

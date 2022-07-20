import ColumnBuilder from "knex/lib/schema/columnbuilder";

class ColumnBuilder_Firebird extends ColumnBuilder {
	primary() {
		this.notNullable();
		return super.primary(...arguments);
	}

	nullable() {
		if (arguments.length === 0 || arguments['0'] === true) {
			return this
		}
		return super.nullable(...arguments)
	}
}

export default ColumnBuilder_Firebird

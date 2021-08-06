import Formatter from "knex/lib/formatter";
import Raw from "knex/lib/raw";

class Firebird_Formatter extends Formatter {
  values(values) {
    if (Array.isArray(values)) {
      if (Array.isArray(values[0])) {
        return `( values ${values
          .map((value) => `(${this.parameterize(value)})`)
          .join(", ")})`;
      }
      return `(${this.parameterize(values)})`;
    }

    if (values instanceof Raw) {
      return `(${this.parameter(values)})`;
    }

    return this.parameter(values);
  }
}

export default Firebird_Formatter;

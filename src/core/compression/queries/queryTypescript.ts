export const queryTypescript = String.raw`
[
  (import_statement) @definition.import
  (export_statement) @definition.export
  (function_declaration) @definition.function
  (generator_function_declaration) @definition.function
  (class_declaration) @definition.class
  (abstract_class_declaration) @definition.class
  (method_definition) @definition.method
  (interface_declaration) @definition.interface
  (type_alias_declaration) @definition.type
  (enum_declaration) @definition.enum
  (variable_declarator
    value: [(arrow_function) (function_expression)]
  ) @definition.function_variable
]
`;

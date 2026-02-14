export const queryPython = String.raw`
[
  (import_statement) @definition.import
  (import_from_statement) @definition.import
  
  (decorated_definition) @definition.decorated
  (function_definition) @definition.function
  (class_definition) @definition.class
]
`;

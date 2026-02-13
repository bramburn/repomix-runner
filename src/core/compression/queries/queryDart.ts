export const queryDart = String.raw`
[
  (import_directive) @definition.import
  (export_directive) @definition.export
  (library_directive) @definition.import
  (part_directive) @definition.import
  (part_of_directive) @definition.import
  
  (class_definition) @definition.class
  (abstract_class_definition) @definition.class
  (mixin_declaration) @definition.class
  (extension_declaration) @definition.class
  
  (enum_declaration) @definition.enum
  
  (function_declaration) @definition.function
  (method_declaration) @definition.method
  (constructor_declaration) @definition.method
  (getter_signature) @definition.method
  (setter_signature) @definition.method
  
  (typedef_declaration) @definition.type
]
`;

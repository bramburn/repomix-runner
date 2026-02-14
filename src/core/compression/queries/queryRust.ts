export const queryRust = String.raw`
[
  (use_declaration) @definition.import
  (mod_item) @definition.module
  
  (function_item) @definition.function
  
  (struct_item) @definition.class
  (enum_item) @definition.enum
  (union_item) @definition.class
  
  (trait_item) @definition.interface
  (impl_item) @definition.class
  
  (type_item) @definition.type
  
  (const_item) @definition.function_variable
  (static_item) @definition.function_variable
  (macro_definition) @definition.function
]
`;

export const queryCsharp = String.raw`
[
  (using_directive) @definition.import
  (namespace_declaration) @definition.module
  
  (class_declaration) @definition.class
  (interface_declaration) @definition.interface
  (struct_declaration) @definition.class
  (record_declaration) @definition.class
  (enum_declaration) @definition.enum
  
  (method_declaration) @definition.method
  (constructor_declaration) @definition.method
  (destructor_declaration) @definition.method
  (operator_declaration) @definition.method
  
  (property_declaration) @definition.method
  (delegate_declaration) @definition.type
  (event_field_declaration) @definition.method
]
`;

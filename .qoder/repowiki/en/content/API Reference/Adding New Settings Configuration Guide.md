# Adding New Settings Configuration Guide

<cite>
**Referenced Files in This Document**
- [package.json](file://package.json)
- [AGENTS.md](file://AGENTS.md)
- [configLoader.ts](file://src/config/configLoader.ts)
- [configSchema.ts](file://src/config/configSchema.ts)
- [SettingsTab.tsx](file://src/webview/components/SettingsTab.tsx)
- [ConfigController.ts](file://src/webview/controllers/ConfigController.ts)
- [messageSchemas.ts](file://src/webview/messageSchemas.ts)
- [openSettings.ts](file://src/commands/openSettings.ts)
- [repomix.config.json](file://repomix.config.json)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Prerequisites and Requirements](#prerequisites-and-requirements)
3. [Step-by-Step Configuration Process](#step-by-step-configuration-process)
4. [Configuration Schema Reference](#configuration-schema-reference)
5. [Implementation Details](#implementation-details)
6. [Testing and Validation](#testing-and-validation)
7. [Troubleshooting Common Issues](#troubleshooting-common-issues)
8. [Best Practices](#best-practices)
9. [Additional Resources](#additional-resources)

## Introduction

This guide provides comprehensive instructions for adding new settings configuration to the Repomix Runner Plus extension. The process involves updating multiple files to ensure proper registration, validation, and integration of new configuration options across the entire extension ecosystem.

The configuration system follows a structured approach that ensures type safety, proper validation, and seamless integration between the VS Code settings UI and the extension's internal configuration management.

## Prerequisites and Requirements

Before adding new settings, ensure you have:

- **VS Code development environment** with TypeScript support
- **Understanding of Zod schemas** for type validation
- **Knowledge of VS Code extension configuration system**
- **Basic understanding of React components** for UI integration
- **Access to the Repomix Runner Plus codebase**

## Step-by-Step Configuration Process

### Step 1: Register Configuration Properties in package.json

The most critical step is registering new settings in the `contributes.configuration.properties` section of `package.json`. This registration is mandatory and prevents runtime errors.

**Key Requirements:**
- Add the new property under the appropriate configuration section
- Define proper data types (`string`, `boolean`, `number`, `array`)
- Set sensible defaults
- Provide descriptive help text with emojis for better UX
- Update enum values if adding to dropdown menus

**Example Registration Pattern:**
```json
{
  "repomix.your.new.setting": {
    "type": "string",
    "default": "default-value",
    "description": "📝 Description of what this setting does"
  }
}
```

**Section sources**
- [package.json](file://package.json#L35-L535)

### Step 2: Define Message Schemas

Add Zod schemas for type-safe communication between webview and extension:

**Request Schema:**
```typescript
export const YourNewSettingSchema = z.object({
  command: z.literal('yourNewSetting'),
});
```

**Result Schema:**
```typescript
export const YourNewSettingResultSchema = z.object({
  command: z.literal('yourNewSettingResult'),
  result: z.any(),
});
```

**Register in WebviewMessageSchema union:**
```typescript
export const WebviewMessageSchema = z.discriminatedUnion('command', [
  YourNewSettingSchema,
  YourNewSettingResultSchema,
  // ... other schemas
]);
```

**Section sources**
- [messageSchemas.ts](file://src/webview/messageSchemas.ts#L1261-L1435)

### Step 3: Implement ConfigController Handlers

Add message handler cases in `ConfigController.ts`:

```typescript
switch (message.command) {
  case 'yourNewSetting':
    await this.handleYourNewSetting(message);
    return true;
  // ... other cases
}
```

Implement the handler method with proper validation and error handling.

**Section sources**
- [ConfigController.ts](file://src/webview/controllers/ConfigController.ts#L31-L174)

### Step 4: Update SettingsTab UI Components

Add state management and UI components in `SettingsTab.tsx`:

```typescript
const [yourSetting, setYourSetting] = useState<string>('');
const [yourSettingExists, setYourSettingExists] = useState<boolean>(false);

// Add message handler
useEffect(() => {
  const handler = (event: MessageEvent) => {
    const message = event.data;
    switch (message.command) {
      case 'yourNewSetting':
        setYourSetting(message.value);
        break;
    }
  };
  // ... event listener setup
}, []);

// Add handler function
const handleSaveYourSetting = () => {
  vscode.postMessage({ 
    command: 'saveYourSetting', 
    value: yourSetting.trim() 
  });
  setYourSetting('');
};
```

**Section sources**
- [SettingsTab.tsx](file://src/webview/components/SettingsTab.tsx#L1-L800)

### Step 5: Update Configuration Schema Validation

Enhance the configuration schema validation in `configSchema.ts`:

```typescript
export const repomixConfigBaseSchema = z.object({
  // ... existing properties
  yourNewSetting: z.string().optional(),
  // ... other properties
}).passthrough();

export const repomixRunnerConfigDefaultSchema = z
  .object({
    // ... existing properties
    yourNewSetting: z.string().default('default-value'),
    // ... other properties
  })
  .passthrough();
```

**Section sources**
- [configSchema.ts](file://src/config/configSchema.ts#L14-L178)

### Step 6: Implement Business Logic

Add the actual business logic that uses your new setting in relevant services or controllers.

## Configuration Schema Reference

The extension uses a hierarchical configuration system with the following structure:

### Core Configuration Sections

| Section | Purpose | Examples |
|---------|---------|----------|
| **Runner** | Execution behavior settings | `repomix.runner.keepOutputFile`, `repomix.runner.copyMode` |
| **Output** | Output formatting options | `repomix.output.style`, `repomix.output.filePath` |
| **Include/Ignore** | File selection patterns | `repomix.include`, `repomix.ignore.customPatterns` |
| **Security** | Security-related options | `repomix.security.enableSecurityCheck` |
| **Token Count** | Token counting configuration | `repomix.tokenCount.encoding` |
| **Embedding** | Embedding provider settings | `repomix.embedding.provider`, `repomix.ollama.url` |

### Configuration Priority Order

The system merges configurations with the following priority (highest to lowest):

1. **overrideConfig** (programmatic override)
2. **configFromRepomixFile** (repomix.config.json)
3. **configFromRepomixRunnerVscode** (VS Code settings)
4. **baseConfig** (default configuration)

**Section sources**
- [configLoader.ts](file://src/config/configLoader.ts#L132-L229)

## Implementation Details

### Type Safety with Zod

The extension uses Zod schemas for comprehensive type validation:

```typescript
// Example of a complex setting with validation
export const yourSettingSchema = z.object({
  command: z.literal('yourSetting'),
  value: z.string().min(1).max(1000),
  enabled: z.boolean(),
  options: z.array(z.string()).optional(),
})
```

### State Management

Settings are managed through React state hooks with automatic persistence:

```typescript
const [yourSetting, setYourSetting] = useState<string>('');
const [isSaving, setIsSaving] = useState<boolean>(false);

useEffect(() => {
  // Load initial state from extension
  vscode.postMessage({ command: 'getYourSetting' });
}, []);

// Auto-save with debouncing
useEffect(() => {
  const timer = setTimeout(() => {
    if (yourSetting.trim()) {
      vscode.postMessage({ 
        command: 'saveYourSetting', 
        value: yourSetting.trim() 
      });
    }
  }, 500);
  return () => clearTimeout(timer);
}, [yourSetting]);
```

### Error Handling

Comprehensive error handling ensures robust configuration management:

```typescript
private async handleSaveYourSetting(value: string) {
  try {
    // Validation
    if (!value.trim()) {
      throw new Error('Setting value cannot be empty');
    }
    
    // Save to secrets storage
    await this.extensionContext.secrets.store(STORAGE_KEY, value);
    
    // Update UI state
    this.context.postMessage({ 
      command: 'yourSettingStatus', 
      exists: true 
    });
    
    vscode.window.showInformationMessage('Setting saved successfully!');
  } catch (error) {
    console.error('Failed to save setting:', error);
    vscode.window.showErrorMessage('Failed to save setting.');
  }
}
```

**Section sources**
- [ConfigController.ts](file://src/webview/controllers/ConfigController.ts#L197-L227)

## Testing and Validation

### Unit Testing

The extension includes comprehensive tests for configuration schemas:

```typescript
import { WebviewMessageSchema } from '../../webview/messageSchemas.js';

suite('Webview Message Schemas', () => {
  test('Valid yourNewSetting message', () => {
    const data = {
      command: 'yourNewSetting',
      value: 'test-value'
    };
    const result = WebviewMessageSchema.safeParse(data);
    assert.strictEqual(result.success, true);
  });
});
```

### Integration Testing

Test the complete configuration flow:

1. **Registration Test**: Verify setting appears in VS Code settings UI
2. **Persistence Test**: Confirm values persist across extension restarts
3. **Validation Test**: Ensure invalid values are rejected
4. **Integration Test**: Verify setting affects extension behavior

**Section sources**
- [messageSchemas.test.ts](file://src/test/webview/messageSchemas.test.ts#L1-L106)

## Troubleshooting Common Issues

### Issue: "Property is not a registered configuration"

**Cause**: Missing registration in `package.json`

**Solution**: Ensure the property is registered in `contributes.configuration.properties`

### Issue: Settings not persisting

**Cause**: Missing secrets storage implementation

**Solution**: Add proper secret storage handling in `ConfigController`

### Issue: Type validation errors

**Cause**: Incorrect Zod schema definition

**Solution**: Review and correct the schema validation logic

### Issue: UI not updating

**Cause**: Missing message handler implementation

**Solution**: Implement proper message handling in `SettingsTab.tsx`

**Section sources**
- [AGENTS.md](file://AGENTS.md#L367-L371)

## Best Practices

### Configuration Design Principles

1. **Consistent Naming**: Use `repomix.section.property` naming convention
2. **Logical Grouping**: Place related settings in the same section
3. **Clear Descriptions**: Provide helpful descriptions with context
4. **Appropriate Defaults**: Set sensible defaults for optimal user experience
5. **Type Safety**: Always define proper TypeScript types and Zod schemas

### Performance Considerations

1. **Debounced Updates**: Implement debouncing for frequently changing settings
2. **Lazy Loading**: Load settings only when needed
3. **Efficient Validation**: Use efficient Zod schema validation
4. **Minimal State**: Keep React state minimal and focused

### Security Best Practices

1. **Secret Storage**: Store sensitive data in VS Code secrets
2. **Input Validation**: Always validate user input
3. **Error Handling**: Gracefully handle configuration errors
4. **Access Control**: Limit access to sensitive configuration options

## Additional Resources

### Related Documentation

- **VS Code Extension Configuration**: Official VS Code documentation for extension configuration
- **Zod Schema Documentation**: Comprehensive Zod schema validation documentation
- **React Hooks Documentation**: React state management and lifecycle methods
- **TypeScript Documentation**: Type safety and interface definitions

### Useful References

- **Configuration Examples**: Existing settings in `package.json` for reference patterns
- **Schema Definitions**: Complete schema definitions in `configSchema.ts`
- **UI Components**: Settings UI implementation in `SettingsTab.tsx`
- **Message Handling**: Communication patterns in `messageSchemas.ts`

### Community Resources

- **VS Code Extension APIs**: Official extension development APIs
- **React Component Patterns**: Modern React component development patterns
- **TypeScript Best Practices**: Recommended TypeScript usage patterns
- **Extension Marketplace Guidelines**: Guidelines for publishing extensions

---

This guide provides a comprehensive framework for adding new settings to the Repomix Runner Plus extension. By following these steps and best practices, you can ensure that new configuration options are properly integrated, validated, and provide a seamless user experience.
use arboard::Clipboard as ArClipboard;
use std::collections::HashSet;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use tempfile::Builder;

fn main() {
    let args: Vec<String> = env::args().collect();

    // Check for --generate-md mode
    if args.len() >= 2 && args[1] == "--generate-md" {
        if let Err(e) = handle_generate_md_mode(&args) {
            eprintln!("Failed to generate markdown and copy to clipboard: {}", e);
            std::process::exit(1);
        }
        println!("Markdown file generated and copied to clipboard successfully.");
        return;
    }

    // Backwards compatible mode (existing behavior)
    if args.len() < 2 {
        eprintln!("Usage:");
        eprintln!("  repomix-clipboard <file_path>");
        eprintln!(
            "  repomix-clipboard --generate-md --cwd <ABS_REPO_ROOT> <REL_FILE_1> <REL_FILE_2> ..."
        );
        std::process::exit(1);
    }

    let file_path = &args[1];
    let path = Path::new(file_path);

    if let Err(e) = copy_file_to_clipboard(path) {
        eprintln!("Failed to copy to clipboard: {}", e);
        std::process::exit(1);
    }

    println!("File copied to clipboard successfully.");
}

/// Handles the --generate-md mode:
/// - Parses args to extract --cwd and file list
/// - De-duplicates file paths
/// - Generates markdown with file contents
/// - Writes to temp file and copies to clipboard
fn handle_generate_md_mode(args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
    // Expected: --generate-md --cwd <ABS_REPO_ROOT> <REL_FILE_1> <REL_FILE_2> ...
    let mut i = 2; // start after "--generate-md"
    let mut cwd: Option<PathBuf> = None;

    while i < args.len() {
        match args[i].as_str() {
            "--cwd" => {
                i += 1;
                if i >= args.len() {
                    return Err("Missing value after --cwd".into());
                }
                cwd = Some(PathBuf::from(&args[i]));
                i += 1;
            }
            // first non-flag token means the rest are files
            _ => break,
        }
    }

    let cwd = cwd.ok_or("--cwd is required in --generate-md mode")?;
    if !cwd.is_absolute() {
        return Err("--cwd must be an absolute path".into());
    }

    let rel_files: Vec<String> = args[i..].iter().cloned().collect();
    if rel_files.is_empty() {
        return Err("No files provided for --generate-md mode".into());
    }

    eprintln!(
        "Generating markdown for {} files in: {}",
        rel_files.len(),
        cwd.display()
    );

    // De-dupe (defensive); preserve order
    let mut seen = HashSet::<String>::new();
    let mut deduped: Vec<String> = Vec::new();
    for f in rel_files {
        let t = f.trim();
        if t.is_empty() {
            continue;
        }
        if seen.insert(t.to_string()) {
            deduped.push(t.to_string());
        }
    }

    let md = build_markdown_from_files(&cwd, &deduped);

    // Write to temp .md and then copy that file to clipboard
    let temp_md_path = write_temp_markdown_file(&md)?;
    eprintln!("Wrote temp markdown file: {}", temp_md_path.display());

    copy_file_to_clipboard(&temp_md_path)?;

    // NOTE: do NOT delete temp_md_path immediately—file-drop clipboard consumers may need it to exist at paste time.

    Ok(())
}

/// Builds markdown content from a list of files.
/// Each file gets a header with its path and fenced content.
fn build_markdown_from_files(cwd: &Path, rel_files: &[String]) -> String {
    let mut out = String::new();

    // TODO to include query in header of the file

    for rel in rel_files {
        let abs = cwd.join(rel);

        // Skip missing files or directories; don't hard fail the entire operation
        let meta = match fs::metadata(&abs) {
            Ok(m) => m,
            Err(_) => {
                eprintln!("Warning: Skipping file (cannot read metadata): {}", rel);
                continue;
            }
        };
        if meta.is_dir() {
            eprintln!("Warning: Skipping directory: {}", rel);
            continue;
        }

        // Read as bytes, then lossy UTF-8 to avoid panics on non-UTF8.
        // This is still "raw" in the sense we do no escaping/transforms like HTML escaping.
        let bytes = match fs::read(&abs) {
            Ok(b) => b,
            Err(_) => {
                eprintln!("Warning: Skipping file (cannot read): {}", rel);
                continue;
            }
        };
        let content = String::from_utf8_lossy(&bytes);

        // Choose a fence that won't conflict if content contains ```
        let (fence, lang) = choose_fence(&content);

        out.push_str("## ");
        out.push_str(rel);
        out.push_str("\n\n");

        out.push_str(&fence);
        out.push_str(lang);
        out.push('\n');

        out.push_str(&content);
        if !content.ends_with('\n') {
            out.push('\n');
        }

        out.push_str(&fence);
        out.push_str("\n\n---\n\n");
    }

    out
}

/// Chooses an appropriate fence length and language for code blocks.
/// Defaults to ```text, but extends if content contains the fence.
fn choose_fence(content: &str) -> (String, &'static str) {
    // default: ```
    // if content contains ``` then use ```
    // if it contains ```` then use ```
    let mut ticks = 3;
    while content.contains(&"`".repeat(ticks)) {
        ticks += 1;
    }
    ("`".repeat(ticks), "text")
}

/// Writes markdown content to a temp file and returns the path.
fn write_temp_markdown_file(md: &str) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let mut tf = Builder::new()
        .prefix("repomix_search_")
        .suffix(".md")
        .tempfile_in(std::env::temp_dir())?;

    use std::io::Write;
    tf.write_all(md.as_bytes())?;

    // Keep the file and get its path
    let (_file, path) = tf.keep()?;
    Ok(path)
}

/// Copies a file to the clipboard using arboard's cross-platform file_list API.
/// This enables proper file copy semantics on Windows, macOS, and Linux.
fn copy_file_to_clipboard(path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    // Ensure we always work with an absolute path for consistency
    let abs_path = if path.is_relative() {
        std::env::current_dir()?.join(path)
    } else {
        path.to_path_buf()
    };

    // Validate that the file exists and is a regular file
    let metadata = std::fs::metadata(&abs_path)?;
    if !metadata.is_file() {
        return Err(format!("Path is not a file: {}", abs_path.display()).into());
    }

    // Create clipboard handle (arboard)
    let mut clipboard = ArClipboard::new()?;

    // arboard::Clipboard::set().file_list takes a slice of &Path
    let paths: [&Path; 1] = [&abs_path];

    clipboard
        .set()
        .file_list(&paths)?; // copies the file to the OS clipboard

    Ok(())
}

import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Label,
  Spinner,
  Text,
  Input,
  Card,
  CardHeader,
  CardPreview,
  CardFooter,
} from '@fluentui/react-components';
import { DeleteRegular, DatabaseSearchRegular, SearchRegular, OpenRegular } from '@fluentui/react-icons';
import { vscode } from '../vscode-api.js';

type RepoSearchResult = {
  id: string;
  score: number;
  path?: string;
  // snippet?: string;
  // you can extend metadata as needed
};

export const SearchTab = () => {
  const [fileCount, setFileCount] = useState<number | null>(null);
  const [vectorCount, setVectorCount] = useState<number | null>(null);

  const [isIndexing, setIsIndexing] = useState(false);

  const [indexProgress, setIndexProgress] = useState<{
    current: number;
    total: number;
    filePath: string;
  } | null>(null);

  const [indexStats, setIndexStats] = useState<{
    repoId: string;
    filesIndexed: number;
    filesEmbedded: number;
    chunksEmbedded: number;
    vectorsUpserted: number;
    failedFiles: number;
    durationMs: number;
  } | null>(null);

  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<RepoSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  const canSearch = useMemo(() => query.trim().length > 0 && !isSearching, [query, isSearching]);

  // De-dupe file paths from search results (stable order)
  const dedupedResultPaths = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];

    for (const r of results) {
      const p = r.path?.trim();
      if (!p) continue;
      if (seen.has(p)) continue;
      seen.add(p);
      out.push(p);
    }

    return out;
  }, [results]);

  const canGenerate = useMemo(
    () => dedupedResultPaths.length > 0 && !isSearching,
    [dedupedResultPaths, isSearching]
  );

  const handleGenerate = () => {
    if (dedupedResultPaths.length === 0) return;

    vscode.postMessage({
      command: 'generateRepomixFromSearch',
      files: dedupedResultPaths,
    });
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;

      switch (message.command) {
        case 'repoIndexCount':
          setFileCount(message.count);
          break;

        case 'indexRepoProgress':
          setIndexProgress({
            current: message.current,
            total: message.total,
            filePath: message.filePath,
          });
          break;

        case 'indexRepoComplete':
          setIsIndexing(false);
          setIndexProgress(null);
          setIndexStats({
            repoId: message.repoId,
            filesIndexed: message.filesIndexed,
            filesEmbedded: message.filesEmbedded,
            chunksEmbedded: message.chunksEmbedded,
            vectorsUpserted: message.vectorsUpserted,
            failedFiles: message.failedFiles,
            durationMs: message.durationMs,
          });

          // reflect local DB count immediately
          setFileCount(message.filesIndexed);

          // refresh Pinecone vector count after indexing:
          vscode.postMessage({ command: 'getRepoVectorCount' });
          break;

        case 'repoIndexComplete':
          // Backward compatible path (older controller behavior)
          setFileCount(message.count);
          setIsIndexing(false);
          setIndexProgress(null);
          vscode.postMessage({ command: 'getRepoVectorCount' });
          break;

        case 'repoIndexDeleted':
          setFileCount(0);
          setVectorCount(0);
          setResults([]);
          setIndexProgress(null);
          setIndexStats(null);
          break;


        case 'repoVectorCount':
          setVectorCount(message.count);
          break;

        case 'repoSearchResults':
          setIsSearching(false);
          setSearchError(null);
          setResults(Array.isArray(message.results) ? message.results : []);
          break;

        case 'repoSearchError':
          setIsSearching(false);
          setSearchError(message.error ?? 'Search failed');
          break;
      }
    };

    window.addEventListener('message', handleMessage);

    // Existing count:
    vscode.postMessage({ command: 'getRepoIndexCount' });
    // Optional pinecone count:
    vscode.postMessage({ command: 'getRepoVectorCount' });

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleIndex = () => {
    setIsIndexing(true);
    setIndexProgress(null);
    setIndexStats(null);
    vscode.postMessage({ command: 'indexRepo' });
  };


  const handleDestroy = () => {
    vscode.postMessage({ command: 'deleteRepoIndex' });
  };

  const handleSearch = () => {
    const q = query.trim();
    if (!q) return;

    setIsSearching(true);
    setSearchError(null);
    setResults([]);

    vscode.postMessage({
      command: 'searchRepo',
      query: q,
      topK: 50,
    });
  };

  const openFile = (path?: string) => {
    if (!path) return;
    vscode.postMessage({ command: 'openFile', path });
  };

  return (
    <div style={{ padding: '10px 0', display: 'flex', flexDirection: 'column', gap: '15px' }}>
      <Label weight="semibold">Repository Indexing</Label>

      {/* Indexing card (existing) */}
      <div
        style={{
          padding: '15px',
          backgroundColor: 'var(--vscode-editor-background)',
          border: '1px solid var(--vscode-widget-border)',
          borderRadius: '4px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <DatabaseSearchRegular style={{ fontSize: '32px', opacity: 0.8 }} />

        <div style={{ textAlign: 'center' }}>
          {fileCount !== null ? <Text size={400} weight="semibold">{fileCount}</Text> : <Spinner size="tiny" />}
          <br />
          <Text size={200} style={{ opacity: 0.7 }}>Files Indexed (local DB)</Text>

          <div style={{ marginTop: '8px' }}>
            {vectorCount !== null ? (
              <Text size={200} style={{ opacity: 0.7 }}>
                Pinecone vectors (repo): <b>{vectorCount}</b>
              </Text>
            ) : (
              <Text size={200} style={{ opacity: 0.5 }}>Loading Pinecone count…</Text>
            )}
          </div>

          {isIndexing && indexProgress && (
            <div style={{ marginTop: '10px', width: '100%', textAlign: 'center' }}>
              <Text size={200} style={{ opacity: 0.7 }}>
                Indexing progress: <b>{indexProgress.current}</b> / {indexProgress.total}
              </Text>
              <br />
              <Text size={200} style={{ opacity: 0.6, whiteSpace: 'pre-wrap' }}>
                {indexProgress.filePath}
              </Text>
            </div>
          )}

          {indexStats && !isIndexing && (
            <div style={{ marginTop: '10px', width: '100%', textAlign: 'center' }}>
              <Text size={200} style={{ opacity: 0.7 }}>
                Embedded files: <b>{indexStats.filesEmbedded}</b> (failed: <b>{indexStats.failedFiles}</b>)
              </Text>
              <br />
              <Text size={200} style={{ opacity: 0.7 }}>
                Chunks/vectors added: <b>{indexStats.vectorsUpserted}</b>
              </Text>
              <br />
              <Text size={200} style={{ opacity: 0.6 }}>
                Time: {(indexStats.durationMs / 1000).toFixed(1)}s
              </Text>
            </div>
          )}

        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <Button
          appearance="primary"
          onClick={handleIndex}
          disabled={isIndexing}
          icon={isIndexing ? <Spinner size="tiny" /> : undefined}
        >
          {isIndexing ? 'Indexing…' : 'Index Repository'}
        </Button>

        <Button
          appearance="secondary"
          icon={<DeleteRegular />}
          onClick={handleDestroy}
          disabled={isIndexing || (fileCount ?? 0) === 0}
        >
          Destroy Index
        </Button>
      </div>

      {/* NEW: Search */}
      <Label weight="semibold" style={{ marginTop: '10px' }}>Semantic Search</Label>

      <div style={{ display: 'flex', gap: '8px' }}>
        <Input
          value={query}
          onChange={(_, data) => setQuery(data.value)}
          placeholder="Search your repo… (semantic)"
          style={{ flexGrow: 1 }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSearch) handleSearch();
          }}

        />
                <Button
          appearance="primary"
          icon={isSearching ? <Spinner size="tiny" /> : <SearchRegular />}
          disabled={!canSearch}
          onClick={handleSearch}
        >
          {isSearching ? 'Searching…' : 'Search'}
        </Button>

        <Button
          appearance="secondary"
          icon={<DatabaseSearchRegular />}
          disabled={!canGenerate}
          onClick={handleGenerate}
        >
          Generate
        </Button>

      </div>
      {dedupedResultPaths.length > 0 && (
        <Text size={200} style={{ opacity: 0.7 }}>
          {dedupedResultPaths.length} unique files ready for repomix
        </Text>
      )}

      {searchError && (
        <Text size={200} style={{ color: 'var(--vscode-errorForeground)' }}>
          {searchError}
        </Text>
      )}

      {results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <Text size={200} style={{ opacity: 0.7 }}>Top {results.length} results</Text>

          {results.map((r) => (
            <Card key={r.id}>
              <CardHeader
                header={<Text weight="semibold">{r.path ?? r.id}</Text>}
                description={<Text size={200} style={{ opacity: 0.7 }}>score: {r.score.toFixed(4)}</Text>}
              />
              {/* {r.snippet && (
                <CardPreview style={{ padding: '0 12px 12px' }}>
                  <Text size={200} style={{ opacity: 0.8, whiteSpace: 'pre-wrap' }}>{r.snippet}</Text>
                </CardPreview>
              )} */}
              <CardFooter>
                <Button
                  appearance="secondary"
                  icon={<OpenRegular />}
                  disabled={!r.path}
                  onClick={() => openFile(r.path)}
                >
                  Open
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Text size={200} style={{ opacity: 0.7, marginTop: '10px' }}>
        Indexing scans files to enable fast semantic search.
      </Text>
    </div>
  );
};

/**
 * C6-T20: 벤치마크 — Debug 성능 측정
 * 
 * 계측 주입/제거 100회 평균 시간, 로그 분석 1000라인 throughput
 */
import * as benny from 'benny';
import { AddInstrumentationTool } from '../../../src/tools/debug/AddInstrumentationTool';
import { RemoveInstrumentationTool } from '../../../src/tools/debug/RemoveInstrumentationTool';
import { LogAnalyzer } from '../../../src/debug/LogAnalyzer';
import { LogEntry } from '../../../src/debug/DebugLogServer';

async function runDebugBenchmarks() {
  const addTool = new AddInstrumentationTool();
  const removeTool = new RemoveInstrumentationTool();
  const analyzer = new LogAnalyzer();

  const summary = await benny.suite(
    'C6 Debug Mode',

    benny.add('Instrumentation 생성 (100회)', () => {
      for (let i = 0; i < 100; i++) {
        addTool.generateInstrumentation({
          filePath: `src/file${i}.ts`,
          hypothesisId: `hyp-${i}`,
          type: 'entry',
          variableName: 'args'
        });
      }
    }),

    benny.add('마커 카운트 (1000라인)', () => {
      const content = Array.from({ length: 1000 }, (_, i) =>
        i % 10 === 0 ? `// DEBUG_INSTRUMENT: hyp-${i}\nconsole.log(${i});` : `const x = ${i};`
      ).join('\n');
      removeTool.countRemaining(content);
    }),

    benny.add('로그 분석 (1000개)', () => {
      const logs: LogEntry[] = Array.from({ length: 1000 }, (_, i) => ({
        id: `log-${i}`,
        level: i % 5 === 0 ? 'error' : 'info',
        source: `src/mod${i % 10}.ts`,
        message: `Message ${i}`,
        timestamp: Date.now() + i
      }));
      analyzer.analyze(logs);
    }),

    benny.cycle((_, results) => {
      for (const result of results) {
        console.log(`${result.name}: ${result.margin?.toPrecision(3) ?? 'N/A'} ops/sec`);
      }
    }),

    benny.complete((summary) => {
      const results = summary.results.map(r => ({
        name: r.name,
        ops: r.ops?.toFixed(0) ?? 'N/A',
        margin: r.margin?.toFixed(2) ?? 'N/A'
      }));
      console.log('\n## Debug Mode Benchmarks\n');
      console.log('| Test | Ops/sec | Margin |');
      console.log('|------|---------|--------|');
      for (const r of results) {
        console.log(`| ${r.name} | ${r.ops} | ±${r.margin}% |`);
      }
    })
  );

  return summary;
}

export { runDebugBenchmarks };

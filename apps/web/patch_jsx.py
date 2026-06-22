import sys

file_path = "apps/web/src/modules/smartrecruit/pages/smartrecruit-page.tsx"

with open(file_path, "r") as f:
    lines = f.readlines()

new_jsx = """  return (
    <PageChrome title="SmartRecruit Screening & Outreach">
      {/* Container - Enterprise Master-Detail Layout */}
      <div className="flex h-[calc(100vh-3.5rem)] flex-col bg-surface overflow-hidden">
        
        {/* BDI Memory Architecture Ribbon */}
        <div className="flex items-center gap-4 border-b border-hairline px-6 py-2 shrink-0 bg-canvas/30 text-eyebrow">
          <span className="font-bold text-ink flex items-center gap-1.5 uppercase">
            <Brain className="size-3.5 text-primary" /> BDI Architecture
          </span>
          <div className="flex items-center gap-3 text-ink-subtle">
            <div className={cn("flex items-center gap-1.5 px-2 py-0.5 rounded border", isGate1Active || runStatus === 'running' || isGate2Active ? "border-blue-500/30 text-blue-600 bg-blue-500/10" : "border-hairline")}>
              <Cpu className="size-3" /> [ STM: {isGate1Active || runStatus || isGate2Active ? 'JD Active' : 'Idle'} ]
            </div>
            <span className="text-hairline-strong">──</span>
            <div className={cn("flex items-center gap-1.5 px-2 py-0.5 rounded border", activeCriteria || isGate2Active ? "border-emerald-500/30 text-emerald-600 bg-emerald-500/10" : "border-hairline")}>
              <Server className="size-3" /> [ WM (Beliefs): {activeCriteria || isGate2Active ? 'Locked' : 'Empty'} ]
            </div>
            <span className="text-hairline-strong">──</span>
            <div className={cn("flex items-center gap-1.5 px-2 py-0.5 rounded border", "border-purple-500/30 text-purple-600 bg-purple-500/10")}>
              <Database className="size-3" /> [ LTM: Connected ]
            </div>
          </div>
        </div>

        {/* Master-Detail Split Pane */}
        <div className="flex flex-1 overflow-hidden">
          
          {/* CỘT TRÁI: PIPELINE CONFIGURATION (Master) */}
          <div className="w-[380px] shrink-0 border-r border-hairline bg-surface flex flex-col h-full z-10 shadow-sm">
            <div className="p-4 border-b border-hairline">
              <h2 className="text-eyebrow font-bold text-ink-subtle uppercase">Pipeline Configuration</h2>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
              
              {/* Phase 1 Setup */}
              <div className="flex flex-col gap-3">
                <label className="text-body-sm font-semibold text-ink flex items-center gap-1.5">
                  <FileText className="size-4" /> 1. Job Description (Desires)
                </label>
                <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Job Title" className="border-hairline h-9 text-body-sm" />
                <Textarea value={jdText} onChange={(e) => setJdText(e.target.value)} placeholder="Paste JD..." rows={8} className="border-hairline resize-none text-body-sm font-mono text-[11px]" />
              </div>

              {/* S3 Data Ingestion */}
              <div className="flex flex-col gap-3 border-t border-hairline pt-5">
                <label className="text-body-sm font-semibold text-ink flex items-center gap-1.5">
                  <HardDrive className="size-4" /> 2. Long-term Memory (S3)
                </label>
                <p className="text-eyebrow text-ink-subtle normal-case leading-relaxed">
                  Sync candidate profiles from the AWS S3 storage to the local vector database.
                </p>
                
                <Button 
                  variant="secondary" 
                  onClick={handleImportMockData} 
                  disabled={isImportingMockData || isScreeningMockPool || isGate1Active || runStatus === 'running'}
                  className="w-full justify-center gap-2 h-9"
                >
                  <RefreshCw className={cn("size-4", isImportingMockData && "animate-spin")} />
                  {isImportingMockData ? 'Syncing...' : 'Sync S3 Candidates'}
                </Button>
                
                {criteriaOptions.length > 0 && (
                  <div className="flex flex-col gap-2 mt-2">
                     <label className="text-eyebrow text-ink-subtle">Criteria Profile Selector</label>
                     <select value={selectedCriteriaId} onChange={(e) => setSelectedCriteriaId(e.target.value)} className="h-9 rounded-md border border-hairline bg-surface px-3 text-body-sm text-ink outline-none">
                        <option value="">Select Criteria Profile</option>
                        {criteriaOptions.map((item) => (
                          <option key={item.id} value={item.id}>{item.job_title}</option>
                        ))}
                     </select>
                  </div>
                )}
                
                {mockDataSummary && (
                   <div className="p-3 bg-emerald-50/50 text-emerald-700 text-body-sm rounded-lg border border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900/50">
                     S3 Sync Complete. Loaded candidates into memory.
                   </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-hairline bg-canvas/30">
               <Button 
                  onClick={handleStartPipeline} 
                  disabled={isGate1Active || runStatus === 'running' || isGate2Active} 
                  className="w-full bg-ink text-surface hover:bg-ink-hover h-10 shadow-sm flex gap-2 justify-center font-medium transition-all"
               >
                  <Play className="size-4 fill-current" /> Launch BDI Pipeline
               </Button>
            </div>
          </div>

          {/* CỘT PHẢI: AGENT WORKSPACE (Detail) */}
          <div className="flex-1 bg-canvas flex flex-col h-full overflow-hidden relative">
            <div className="px-6 py-4 border-b border-hairline bg-surface shrink-0 flex items-center justify-between shadow-sm z-10">
              <h2 className="text-eyebrow font-bold text-ink-subtle">
                {(isGate1Active || runStatus || isGate2Active) ? 'AGENT EXECUTION RUN' : 'WORKSPACE'}
              </h2>
              {(isGate1Active || runStatus || isGate2Active) && (
                 <div className="flex items-center gap-2 bg-surface-1 border border-hairline rounded-md px-2 py-1">
                   <span className={cn("flex size-2 rounded-full", runStatus === 'running' ? 'bg-emerald-500 animate-ping' : 'bg-amber-500')} />
                   <span className={cn("text-eyebrow font-bold uppercase", runStatus === 'running' ? 'text-emerald-600' : 'text-amber-600')}>
                     {runStatus === 'running' ? 'Running' : 'Paused (HITL)'}
                   </span>
                 </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6 relative">
              
              {/* IDLE STATE */}
              {!runStatus && !isGate1Active && !isGate2Active && (
                 <div className="h-full flex flex-col items-center justify-center text-ink-subtle gap-4 max-w-sm mx-auto text-center">
                    <div className="size-16 rounded-full bg-surface-1 border border-hairline flex items-center justify-center">
                      <Brain className="size-8 text-ink-muted" />
                    </div>
                    <p className="text-body-sm">
                      Nothing has run yet. Configure the JD criteria on the left and click Launch to start the BDI Agent workflow.
                    </p>
                 </div>
              )}

              {/* GIAI ĐOẠN 1 (GATE 1): DUYỆT TIÊU CHÍ */}
              {isGate1Active && activeCriteria && (
                 <div className="max-w-4xl mx-auto flex flex-col gap-6 animate-in slide-in-from-bottom-4 duration-300">
                    <div className="bg-amber-50 border-l-4 border-l-amber-500 border-amber-200 rounded-r-lg p-4 flex flex-col gap-2 dark:bg-amber-950/20 dark:border-amber-900/50">
                       <div className="flex items-center gap-2 text-amber-800 font-bold text-body-sm dark:text-amber-500 uppercase tracking-wide">
                         <AlertTriangle className="size-4" /> [HITL GATE] Execution Paused: Pending Review
                       </div>
                       <p className="text-amber-700 text-body-sm dark:text-amber-400">
                         The BDI Planner has successfully extracted technical criteria from the Job Description. Please review and approve these criteria before the Agent saves them to <strong className="font-semibold">Working Memory (Beliefs)</strong> and proceeds to candidate screening.
                       </p>
                    </div>

                    <Card className="shadow-sm border-hairline bg-surface">
                       <div className="p-4 border-b border-hairline bg-canvas/30 flex justify-between items-center">
                         <h3 className="text-body-sm font-bold text-ink">Extracted Screening Criteria</h3>
                         <Badge className="bg-blue-500/10 text-blue-600 border border-blue-500/20">Phase 1</Badge>
                       </div>
                       
                       <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                         <div className="flex flex-col gap-4">
                           <div className="flex flex-col gap-1.5">
                             <label className="text-eyebrow text-ink-subtle">Target Job Title</label>
                             <Input value={activeCriteria.job_title} onChange={(e) => setActiveCriteria({...activeCriteria, job_title: e.target.value})} className="border-hairline h-9 text-body-sm font-medium bg-canvas/50" />
                           </div>
                           <div className="flex flex-col gap-1.5">
                             <label className="text-eyebrow text-ink-subtle">Min Years of Experience (YOE)</label>
                             <Input type="number" value={activeCriteria.min_yoe} onChange={(e) => setActiveCriteria({...activeCriteria, min_yoe: parseInt(e.target.value, 10) || 0})} className="border-hairline h-9 text-body-sm bg-canvas/50" />
                           </div>
                         </div>
                         
                         <div className="flex flex-col gap-4">
                            <div className="flex flex-col gap-2">
                               <label className="text-eyebrow text-ink-subtle flex items-center gap-1"><span className="size-2 rounded-full bg-rose-500" /> Must-Have Technical Skills</label>
                               <div className="flex flex-wrap gap-2">
                                 {activeCriteria.must_have_skills.map((skill, idx) => (
                                   <Badge key={idx} variant="secondary" className="bg-surface border-hairline text-body-sm font-medium px-2 py-1 gap-1">
                                     {skill}
                                     <button onClick={() => setActiveCriteria({...activeCriteria, must_have_skills: activeCriteria.must_have_skills.filter((_, i) => i !== idx)})} className="text-ink-muted hover:text-rose-500">&times;</button>
                                   </Badge>
                                 ))}
                               </div>
                            </div>
                            <div className="flex flex-col gap-2">
                               <label className="text-eyebrow text-ink-subtle flex items-center gap-1"><span className="size-2 rounded-full bg-blue-500" /> Nice-to-Have Skills</label>
                               <div className="flex flex-wrap gap-2">
                                 {activeCriteria.nice_to_have_skills.map((skill, idx) => (
                                   <Badge key={idx} variant="secondary" className="bg-surface border-hairline text-body-sm font-medium px-2 py-1 gap-1">
                                     {skill}
                                     <button onClick={() => setActiveCriteria({...activeCriteria, nice_to_have_skills: activeCriteria.nice_to_have_skills.filter((_, i) => i !== idx)})} className="text-ink-muted hover:text-rose-500">&times;</button>
                                   </Badge>
                                 ))}
                               </div>
                            </div>
                         </div>
                       </div>
                       
                       <div className="p-4 bg-canvas/50 border-t border-hairline flex justify-end gap-3">
                          <Button variant="ghost" onClick={handleDeclineWorkflow} className="text-rose-600 hover:text-rose-700 hover:bg-rose-50">Reject & Abort</Button>
                          <Button onClick={handleConfirmCriteria} disabled={isConfirmingCriteria} className="bg-ink text-surface hover:bg-ink-hover shadow-sm flex gap-2 items-center">
                             {isConfirmingCriteria ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle className="size-4" />}
                             Approve & Save to Beliefs
                          </Button>
                       </div>
                    </Card>
                 </div>
              )}

              {/* GIAI ĐOẠN 2: BDI LIVE CONSOLE (RUNNING) */}
              {runStatus === 'running' && !activeApproval && (
                 <div className="h-full flex flex-col gap-6 animate-in zoom-in-95 duration-300">
                    <div className="flex flex-col gap-1">
                      <h3 className="text-body-lg font-bold text-ink">BDI Agent Execution Console</h3>
                      <p className="text-body-sm text-ink-subtle">The agent is autonomously executing Phase 2: Concurrent Screening & Outreach Drafting.</p>
                    </div>

                    {/* Live Terminal Log */}
                    <div className="bg-[#0A0A0A] rounded-xl border border-hairline-strong h-64 p-5 font-mono text-[11px] leading-relaxed overflow-y-auto flex flex-col gap-1.5 shadow-2xl relative">
                       <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500/0 via-emerald-500 to-emerald-500/0 animate-pulse" />
                       
                       <div className="text-emerald-500 font-bold mb-3">Seta Agentic OS v1.0.0 -- Live execution feed</div>
                       
                       <div className="text-zinc-400">[{new Date().toLocaleTimeString()}] <span className="text-blue-400">[Desire]</span> Intent recognized: Screen candidate pool against approved criteria.</div>
                       <div className="text-zinc-400">[{new Date().toLocaleTimeString()}] <span className="text-blue-400">[Tool]</span> Executing <span className="text-purple-400">semantic_search_tool</span> on Long-term Mem (S3)...</div>
                       <div className="text-zinc-400">[{new Date().toLocaleTimeString()}] <span className="text-emerald-400">[Feedback ✔]</span> Found candidate batch.</div>
                       <div className="text-zinc-400">[{new Date().toLocaleTimeString()}] <span className="text-blue-400">[Tool]</span> Executing <span className="text-purple-400">screen_cv_tool</span> concurrently...</div>
                       
                       <div className="text-amber-500 mt-2">[{new Date().toLocaleTimeString()}] <span className="font-bold">[ALT - ERROR]</span> Corrupted file format detected for Candidate ID: 104. Triggering OCR Fallback Plan...</div>
                       <div className="text-zinc-400">[{new Date().toLocaleTimeString()}] <span className="text-blue-400">[Tool]</span> Executing <span className="text-purple-400">ocr_tool</span>...</div>
                       <div className="text-emerald-500">[{new Date().toLocaleTimeString()}] <span className="text-emerald-400">[Feedback ✔]</span> OCR Successful. Text extracted.</div>
                       
                       <div className="text-zinc-400 mt-2">[{new Date().toLocaleTimeString()}] <span className="text-blue-400">[Tool]</span> Executing <span className="text-purple-400">draft_outreach_tool</span>...</div>
                       <div className="text-rose-500 animate-pulse bg-rose-500/10 border border-rose-500/20 p-2 mt-1 rounded">[{new Date().toLocaleTimeString()}] <span className="font-bold">[ANTI-HALLUCINATION FILTER]</span> Hallucination detected in draft: Skill "ReactJS" not found in CV. Rejecting draft. Regenerating with Temp=0...</div>
                       <div className="text-emerald-500 mt-1">[{new Date().toLocaleTimeString()}] <span className="text-emerald-400">[Feedback ✔]</span> Safe draft generated. Saved to Working Mem.</div>
                       
                       {/* Blinking cursor */}
                       <div className="w-2 h-3 bg-emerald-500 animate-ping mt-1" />
                    </div>

                    {/* Concurrent Processing Grid (Mock display of candidates) */}
                    <div className="flex-1 bg-surface border border-hairline rounded-xl p-5 flex flex-col gap-4 shadow-sm">
                       <h4 className="text-eyebrow font-bold text-ink-subtle uppercase flex items-center gap-2">
                         <RefreshCw className="size-3.5 animate-spin text-primary" /> Concurrent Batch Processing
                       </h4>
                       <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                          {Array.from({ length: 10 }).map((_, i) => (
                             <div key={i} className="p-3 border border-hairline rounded-lg bg-canvas/30 flex flex-col gap-2.5 relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-1 h-full bg-primary/50" />
                                <span className="text-body-sm font-bold truncate text-ink">Cand_Profile_{i+1}.pdf</span>
                                <div className="h-1.5 w-full bg-surface-2 rounded-full overflow-hidden">
                                   <div className="h-full bg-primary w-2/3 animate-pulse" />
                                </div>
                                <span className="text-[10px] text-ink-muted uppercase font-mono tracking-wider">Processing...</span>
                             </div>
                          ))}
                       </div>
                    </div>
                 </div>
              )}

              {/* GIAI ĐOẠN 3 (GATE 2): DUYỆT SHORTLIST & DRAFTS */}
              {isGate2Active && (
                 <div className="h-full flex flex-col gap-6 animate-in slide-in-from-bottom-4 duration-300">
                    <div className="bg-blue-50 border-l-4 border-l-blue-500 border-blue-200 rounded-r-lg p-4 flex flex-col gap-2 dark:bg-blue-950/20 dark:border-blue-900/50 shrink-0">
                       <div className="flex items-center gap-2 text-blue-800 font-bold text-body-sm dark:text-blue-500 uppercase tracking-wide">
                         <AlertCircle className="size-4" /> [HITL GATE] Final Review & Dispatch
                       </div>
                       <p className="text-blue-700 text-body-sm dark:text-blue-400">
                         Agent has completed Phase 2. Please review the final Candidate Shortlist and Outreach Email Drafts before approving bulk dispatch.
                       </p>
                    </div>

                    <div className="flex-1 flex gap-6 overflow-hidden">
                       
                       {/* Left side: Candidate List */}
                       <div className="w-[300px] shrink-0 flex flex-col gap-3 bg-surface border border-hairline rounded-lg overflow-hidden shadow-sm">
                          <div className="p-3 border-b border-hairline bg-canvas/30">
                            <h4 className="text-body-sm font-bold text-ink">Shortlist ({filteredCandidates.length})</h4>
                          </div>
                          <div className="flex-1 overflow-y-auto divide-y divide-hairline">
                             {filteredCandidates.map(cand => {
                               const isSelected = selectedCandidate?.id === cand.id;
                               return (
                                 <div key={cand.id} onClick={() => handleSelectCandidate(cand)} className={cn("p-3 cursor-pointer transition-colors flex items-center justify-between", isSelected ? "bg-primary-tint/20 border-l-4 border-l-primary" : "hover:bg-canvas")}>
                                   <div className="flex flex-col min-w-0 gap-0.5">
                                     <span className="text-body-sm font-bold text-ink truncate">{cand.display_name}</span>
                                     {isHallucinationFail(cand.id) ? (
                                        <span className="text-[10px] font-bold text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded w-fit uppercase">Hallucination Alert</span>
                                     ) : (
                                        <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded w-fit uppercase">Safe Draft</span>
                                     )}
                                   </div>
                                   <Badge className={cn("shrink-0", (cand.fit_score ?? 0) >= 80 ? "bg-emerald-500 text-white" : "bg-amber-500 text-white")}>
                                     {cand.fit_score}%
                                   </Badge>
                                 </div>
                               );
                             })}
                          </div>
                       </div>

                       {/* Right side: Scorecard & Draft Editor */}
                       <div className="flex-1 bg-surface border border-hairline rounded-lg overflow-y-auto flex flex-col p-6 gap-6 shadow-sm">
                          {selectedCandidate && editingDraft && (
                             <>
                               {/* Scorecard Summary */}
                               <div className="flex flex-col gap-2">
                                  <h4 className="text-body-sm font-bold text-ink border-b border-hairline pb-2 uppercase tracking-wide flex items-center gap-2">
                                    Candidate Suitability <Badge className="bg-emerald-500 text-white">{selectedCandidate.fit_score}% Fit</Badge>
                                  </h4>
                                  <div className="text-body-sm text-ink-subtle italic bg-canvas/30 p-3 rounded-lg border border-hairline mt-2">
                                    {candidateReport(selectedCandidate).yoeExplanation || "Candidate fits the profile requirements based on Vector Search."}
                                  </div>
                               </div>

                               {/* Email Draft Editor */}
                               <div className="flex flex-col gap-3">
                                  <div className="flex items-center justify-between mt-2">
                                    <h4 className="text-body-sm font-bold text-ink uppercase tracking-wide">Outreach Email Draft</h4>
                                    {editingDraft.hallucination_check_status === 'failed' ? (
                                       <Badge className="bg-rose-50 text-rose-600 border border-rose-200 animate-pulse">Adoption Filter: FAILED</Badge>
                                    ) : (
                                       <Badge className="bg-emerald-50 text-emerald-600 border border-emerald-200">Adoption Filter: PASS</Badge>
                                    )}
                                  </div>
                                  
                                  <div className="flex flex-col gap-3">
                                     <div className="flex flex-col gap-1">
                                        <label className="text-eyebrow text-ink-subtle">Subject</label>
                                        <Input value={editingDraft.subject} onChange={(e) => setEditingDraft({...editingDraft, subject: e.target.value})} className="border-hairline bg-canvas/50 font-bold" />
                                     </div>
                                     <div className="flex flex-col gap-1">
                                        <label className="text-eyebrow text-ink-subtle">Email Body</label>
                                        <Textarea value={editingDraft.body} onChange={(e) => setEditingDraft({...editingDraft, body: e.target.value})} rows={10} className={cn("border-hairline font-mono text-[11px] leading-relaxed bg-canvas/50", editingDraft.hallucination_check_status === 'failed' && "border-rose-500/50 bg-rose-500/5 focus:ring-rose-500")} />
                                     </div>
                                  </div>
                               </div>
                             </>
                          )}
                       </div>
                    </div>

                    <div className="bg-surface border-t border-hairline p-4 flex justify-end gap-3 shrink-0 shadow-sm rounded-lg mt-auto">
                       <Button variant="ghost" onClick={handleDeclineWorkflow} className="text-rose-600">Cancel</Button>
                       <Button onClick={handleApproveOutreachBulk} disabled={isApprovingOutreach} className="bg-ink text-surface hover:bg-ink-hover flex gap-2 items-center">
                          {isApprovingOutreach ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
                          Approve & Dispatch All
                       </Button>
                    </div>
                 </div>
              )}

              {/* SUCCESS STATE */}
              {runStatus === 'success' && (
                 <div className="h-full flex flex-col items-center justify-center text-center gap-4 animate-in zoom-in-95 duration-300">
                    <div className="size-20 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                       <CheckCircle className="size-10 text-emerald-500" />
                    </div>
                    <div className="flex flex-col gap-1 max-w-md">
                       <h2 className="text-body-xl font-bold text-ink">Pipeline Complete!</h2>
                       <p className="text-body-sm text-ink-subtle">
                         Outreach emails dispatched successfully. Interaction history has been saved back to <strong className="font-semibold text-ink">Long-term Memory (S3)</strong>.
                       </p>
                    </div>
                    <Button onClick={resetPipeline} className="bg-surface border border-hairline text-ink hover:bg-canvas mt-2">
                       Start New Workflow
                    </Button>
                 </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </PageChrome>
  );
}

export default SmartrecruitPage;
"""

idx_start = -1
for i, line in enumerate(lines):
    if line.strip().startswith("return (") and "PageChrome title=" in lines[i+1]:
        idx_start = i
        break

if idx_start != -1:
    lines = lines[:idx_start]
    with open(file_path, "w") as f:
        f.writelines(lines)
        f.write(new_jsx)
else:
    print("Could not find start index")

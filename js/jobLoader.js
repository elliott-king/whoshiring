goog.require('Matrix.Cells')
goog.require('Matrix.Model')
goog.require('Matrix.mxWeb')
goog.require('Hiring.usernote')
goog.require('Hiring.jobDomParse')
goog.provide('Hiring.jobLoader')

// --- loading job data -----------------------------------------

const SEARCH_MO_IDX = 0;

function pickAMonth() {
    return div({class: "pickAMonth"}
        , select({
                name: "searchMonth"
                , class: "searchMonth"
                , value: cI(gMonthlies[SEARCH_MO_IDX].hnId)
                , onchange: (mx, e) => {
                    let pgr = mx.fmUp("progress")
                    ast(pgr)
                    pgr.value = 0
                    pgr.maxN = 0
                    pgr.seen = new Set()
                    pgr.hidden = false
                    mx.value = e.target.value
                }
            }
            // --- start with this if initial load is too slow----
            // , option( {value: "none"
            //         , selected: "selected"
            //         , disabled: "disabled"}
            //     , "Pick a month. Any month.")
            , gMonthlies.map((m, x) => option({
                    value: m.hnId
                    , selected: x === SEARCH_MO_IDX ? "selected" : null
                }
                , m.desc)))

        , div({style: hzFlexWrapCentered}
            , viewOnHN(cF(c => `https://news.ycombinator.com/item?id=${c.md.fmUp("searchMonth").value}`)
                , {hidden: cF(c => !c.md.fmUp("searchMonth").value)})
            , span({
                style: "color: #fcfcfc; margin: 0 12px 0 12px"
                , hidden: cF(c => !c.md.fmUp("searchMonth").value)
                , content: cF(c => {
                    let pgr = c.md.fmUp("progress")
                        , jobs = c.md.fmUp("jobLoader").jobs || [];
                    return pgr.hidden ? "Total jobs: " + jobs.length
                        : "Parsing: " + PARSE_CHUNK_SIZE * pgr.value
                })
            })

            , progress({
                max: cF(c => c.md.maxN + "")
                , hidden: cF(c => !c.md.fmUp("searchMonth").value)
                , value: cI(0)
            }, {
                name: "progress"
                , maxN: cI(0)
                , seen: cI(new Set())
            })
        ))
}

var startLoad;

function jobListingLoader() {
    return div({style: "visibility:collapsed;"}
        , {
            name: "jobLoader"
            , jobs: cF(c => {
                let parts = c.md.kids.map(k => k.jobs);
                if (parts.every(p => p !== null)) {
                    //clg('all jobs resolved!!!!', parts.map( p => p.length))
                    let all = parts.reduce((accum, pj) => {
                        return accum.concat(pj)
                    });
                    //clg("jobs", all.slice(0, 3).map(j => JSON.stringify(j)));
                    return all;
                } else {
                    return null
                }
            }, {
                observer: (s, md, newv) => {
                    if (newv) {
                        md.fmUp("progress").hidden = true;
                    }
                }
            })
        }
        , c => {
            startLoad = Date.now();

            let selId = c.md.fmUp("searchMonth").value
                , moDef = gMonthlies.find(mo => mo.hnId === selId)
                , pgCt = moDef.pgCount; // todo SHIPCHECK

            if (moDef.pgCount > 0) {
                return myRange( pgCt ).map(pgn => {
                    return mkPageLoader(c.md, moDef.hnId, pgn + 1)
                })
            } else {
                return mkPageLoader(c.md, moDef.hnId)
            }
        })
}

function mkPageLoader(par, hnId, pgNo) {
    return iframe({
            src: cF(c => {
                if (hnId === null) {
                    return ""
                } else if (pgNo === undefined) {
                    return `files/${hnId}/${hnId}.html`
                } else {
                    return `files/${hnId}/${pgNo}.html`
                }
            })
            , style: "display: none"
            , onload: md => jobsCollect( md, pgNo)
        }
        , {
            jobs: cI(null)
            , pgNo: pgNo
        }
    )
}

var PARSE_CHUNK_SIZE = 100 // todo SHIPCHECK
var PAGE_JOBS_MAX = 1000 // todo SHIPCHECK limit this during dev if faster laod needed

function jobsCollect(md, pgNo) {
    if (md.dom.contentDocument) {
        hnBody = md.dom.contentDocument.getElementsByTagName('body')[0];
        let chunkSize = PARSE_CHUNK_SIZE
            , listing = Array.prototype.slice.call(hnBody.querySelectorAll('.athing'))
            , tempJobs = []
            , pgr = md.fmUp("progress");

        if (listing.length > 0) {
            pgr.maxN = pgr.maxN + Math.floor( listing.length / PARSE_CHUNK_SIZE)
            parseListings( md, listing, tempJobs, PARSE_CHUNK_SIZE, pgr)
            //clg("jobs found", md.jobs.length, "page", pgNo)
        } else {
            md.jobs = []
        }
    } else {
        md.jobs = [];
    }
}

var dbg = false;

function parseListings(md, listing, tempJobs, chunkSize, progressBar) {
    let total = listing.length
        , totchar = 0
        , chunker = offset => {
        let jct = Math.min(total - offset, chunkSize)
        //clg('doing chunk', offset, jct, tempJobs.length)

        if (jct > 0) {
            for (jn = 0; jn < jct; ++jn) {
                let dom = listing[offset + jn];

                if (progressBar.seen.has(dom.id)) {
                    // Thorn! clg('hnID already seen; NOT aborting pageNo', dom.id, md.pgNo)
                } else {
                    progressBar.seen.add(dom.id)

                    let spec = jobSpec(listing[offset + jn])

                    if (spec.OK) {
                        let hnId = spec.hnId;

                        spec.pgNo = md.pgNo;

                        if (!UNote.dict[hnId]) {
                            UNote.dict[hnId] = new UserNotes({hnId: hnId});
                        }
                        tempJobs.push(spec)
                    }
                }
            }
            progressBar.value = progressBar.value + 1
            //window.requestAnimationFrame(() => chunker( offset + jct))

            if (tempJobs.length < PAGE_JOBS_MAX)
                window.requestAnimationFrame(() => chunker(offset + jct))
            else {
                md.jobs = tempJobs;
                //clg('page loaded 1', md.pgNo, tempJobs.length, "elapsed=", Date.now() - startLoad)
                frameZap(md);
                //clg('post dom zap!!', domAthings(md.dom).length);
            }
        } else {
            md.jobs = tempJobs;
            clg('page loaded 2', md.pgNo, tempJobs.length, "elapsed=", Date.now() - startLoad)
            frameZap(md);
        }
    }
    chunker(0);
}

function frameZap(md) {
    b = md.dom.contentDocument.getElementsByTagName('body')[0];
    b.innerHTML = "";
}



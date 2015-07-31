/*eslint-env browser, jquery, node*/ 
/*eslint quotes:0, key-spacing:0, no-multi-spaces:0, comma-spacing:0, space-infix-ops:0, no-underscore-dangle:0, no-loop-func:1, eqeqeq:1, no-trailing-spaces:1*/
(function(window, $, undefined) {
  'use strict';

  var appContext = $('[data-app-name="araport-blast-app"]');

  //the different blast types and their app IDs
  var blastTypes = {
    'blastn' : 'ncbi-blastn-2.2.29u6',
    'blastp':'ncbi-blastp-2.2.29u5',
    'blastx':'ncbi-blastx-2.2.29u4',
    'tblastn':'ncbi-tblastn-2.2.29u5',
    'tblastx':'ncbi-tblastx-2.2.29u4',
  };

  //app template
  var BLAST_CONFIG = {
        'name': 'blast-%DATESTAMP',
        'appId': 'ncbi-blastn-2.2.29u3',
        'queue': 'normal',
        'nodeCount': 1,
        'maxMemoryPerNode': 1,
        'processorsPerNode': 1,
        'requestedTime': '00:30:00',
        'archive': true,
        'archivePath': '%USERNAME/archive/jobs/blast-%DATESTAMP',
        'archiveSystem': 'araport-storage-00',
        /*
        'notifications': [{
             'url':'username@tacc.utexas.edu',
             'event':'FINISHED',
             'persistent':false
          }],
        */
        'parameters' : {
            'database': 'TAIR10_cdna_20101214_updated',
            'evalue': 0.001,
            'format':'HTML',
            'ungapped':false,
            'matrix':'BLOSUM62',
            'filter':true,
            'lowercase_masking':false
        },
        'inputs': {
                    'query': 'mock/test.nt.fa'
        }
    };

    BLAST_CONFIG.runningStates  = ['PENDING', 'STAGING_INPUTS', 'CLEANING_UP', 'ARCHIVING', 'STAGING_JOB', 'RUNNING', 'PAUSED', 'QUEUED', 'SUBMITTING', 'STAGED', 'PROCESSING_INPUTS', 'ARCHIVING_FINISHED'];
    BLAST_CONFIG.errorStates    = ['KILLED', 'FAILED', 'STOPPED','ARCHIVING_FAILED'];
    BLAST_CONFIG.finishedStates = ['FINISHED'];

    var BlastApp = {}; //info dumping ground 
    //using date and time as an identifier. probably should switch this to a uuid or something 
    if (!Date.now) { 
        Date.now = function() { return new Date().getTime(); }; 
    } 
    var now = Date.now(); 
    BlastApp.now = now; 
    BLAST_CONFIG.archivePath = BLAST_CONFIG.archivePath.replace('%DATESTAMP',now); 
    BLAST_CONFIG.name = BLAST_CONFIG.name.replace('%DATESTAMP',now);

    /* PRIVATE FUNCTIONS */
    BlastApp.updateStatusIcon = function(status){
        var ppc = appContext.find('.job-status .blast-job-status-icon');
        ppc.removeClass('glyphicon-remove glyphicon-ok glyphicon-refresh blast-reload-icon');
        switch(status){
            case "pending":
                ppc.addClass('glyphicon-refresh blast-reload-icon');
                break;
            case "error":
                ppc.addClass('glyphicon-remove');
                break;
            case "success":
                ppc.addClass('glyphicon-ok');
                break;
        }
    };

    BlastApp.checkJobListStatus = function(){
        var tbody = appContext.find('.blast-job-history-content table tbody')[0];
        var trs = tbody.rows;
        var tr, status, id, newStatus, td, icon, cnt;
        var sf = function(response){
            var data = JSON.parse(response.data);
            if(data.status === "success"){
                newStatus = data.result.status;
                tr = $(tbody).find("tr[data-id=" + data.result.id + "]");
                td = $(tr.find("td")[0]);
                if(BLAST_CONFIG.errorStates.indexOf(newStatus) >= 0) {
                    icon = td.find('.job-list-icon span');
                    icon.removeClass('glyphicon-refresh blast-reload-icon');
                    icon.addClass('glyphicon-remove');
                    icon.attr('style', 'color:red;');
                    tr.attr('data-status', newStatus);
                    td.find('.job-list-status').text(newStatus);
                }else if(BLAST_CONFIG.finishedStates.indexOf(newStatus) >= 0) {
                    icon = td.find('.job-list-icon span');
                    icon.removeClass('glyphicon-ok blast-reload-icon');
                    icon.addClass('glyphicon-ok');
                    icon.attr('style', 'color:green;');
                    tr.attr('data-status', newStatus);
                    td.find('.job-list-status').text(newStatus);
                }else if(BLAST_CONFIG.runningStates.indexOf(newStatus) >= 0) {
                    tr.attr('data-status', newStatus);
                    td.find('.job-list-status').text(newStatus);
                }
            }
        };
        var ef = function(err){

                        /* TODO: If a job is pending this will return a 404. We can just keep checking until we get something.
                                 Maybe just stop and then show a "refresh" button? */
                    };
        cnt = 0;
        for(var i = 0; i < trs.length; i++){
            tr = trs[i];
            status = tr.getAttribute('data-status');
            id = tr.getAttribute('data-id');
            if(BLAST_CONFIG.runningStates.indexOf(status) >= 0) {
                cnt++;
                td = $(tr.querySelector("td"));
                window.Agave.api.jobs.getStatus({"jobId":id},
                    sf,
                    ef);
            }
        }
        if(cnt == 0){
            clearInterval(BlastApp._jobListChecker);

        }
    };

    BlastApp.showTooltip = function(el){
        var tr = el.parent().parent().parent();
        var id = tr[0].getAttribute("data-id");
        var status = tr[0].getAttribute("data-status");
        var span = $(".blast-history-meta span#" + id);
        if ( span.hasClass("blast-hidden") ){
            $(".blast-history-meta span").addClass("blast-hidden");
            if(tr.offset().top < span.height()){
                span.addClass("north");
                span.css({top: tr.offset().top + tr.height(), left:tr.parent().width() / 2});
            } else {
                span.css({top: tr.offset().top - span.height(), left:tr.parent().width() / 2});
                span.removeClass("north");
            }
            span.removeClass("blast-hidden");
        }else{
            $(".blast-history-meta span").addClass("blast-hidden");
            span.addClass("blast-hidden");
        }
    };

    BlastApp.downloadArchivedResults = function(archive){
        if(typeof archive !== 'undefined'){
            var Agave = window.Agave;
            var outputData;
            Agave.api.files.download({'systemId':BLAST_CONFIG.archiveSystem,'filePath':archive},
                function(output) {
                    console.log(output);
                    outputData = output.data;
                    console.log(outputData);
                    try {
                        var isFileSaverSupported = !!new Blob();
                        if(!isFileSaverSupported) { 
                            BlastApp.jobError('Sorry, your browser does not support this feature. Please upgrade to a modern browser.'); }
                    } catch (e) {
                        BlastApp.jobError('Sorry, your browser does not support this. Please upgrade to a modern browser.');
                        return;
                    }
                    if(typeof outputData === 'undefined') {
                        BlastApp.jobError('Could not download data.');
                    }else{
                        var paths = archive.split("/");
                        var fileName = paths[paths.length-1] + '_' + paths[paths.length-2].split('-')[1] + '_out.' + BLAST_CONFIG.parameters.format;
                        window.saveAs(new Blob([outputData]), fileName);
                    }
                },
                function(err) {
                    console.log('Could not download the results file!');
                    //todo error handling here
                    BlastApp.jobError('Could not get resulting output file. ' + err);
                }
            );
        }
    };

    BlastApp.manageJob = function(jobId, action){
        var Agave = window.Agave;
        Agave.api.jobs.manage({'jobId': jobId, 'body':"{\"action\":\"" + action + "\"}"}, 
            function(response){
                var data = JSON.parse(response.data);
                if(data.status == "success"){
                    BlastApp.getJobList();
                }
            }, 
            function(err){
                BlastApp.jobError("There was an error resubmitting the job, please refresh and try again.");
                if(console){
                    console.log(err.reason);
                }
            });
    };

    BlastApp.createActionLinks = function(job, row){
        var tdspan = row.find(".blast-history-actions");
        var a = $("<a href=\"#\">" + 
              "<span class=\"glyphicon glyphicon-refresh\"></span> " + 
              "<span>Resubmit</span>" +
              "</a>");
        a.click(function(e){
            e.preventDefault();
            var el = $(this);
            var jobId = el.parent().parent().parent().attr("data-id");
            el.find('.glyphicon').addClass('blast-reload-icon');
            BlastApp.manageJob(jobId, "resubmit");
        });
        tdspan.append(a);
        tdspan.append("<br>");

        if(BLAST_CONFIG.runningStates.indexOf(job.status) >= 0) {
            a = $("<a href=\"#\">" + 
                  "<span class=\"glyphicon glyphicon-stop\"></span> " + 
                  "<span>Stop</span>" +
                  "</a>");
            a.click(function(e){
                e.preventDefault();
                var el = $(this);
                var jobId = el.parent().parent().parent().attr("data-id");
                el.find('.glyphicon').addClass('blast-reload-icon');
                BlastApp.manageJob(jobId, "stop");
            });
            tdspan.append(a);
            tdspan.append("<br>");
        }

        a = $("<a href=\"#\">" +
              "<span class=\"glyphicon glyphicon-info-sign\"></span>" +
              "<span> More Info</span>" +
              "</a>");
        a.click(function(e){
            e.preventDefault();
            BlastApp.showTooltip($(this));
        });
        tdspan.append(a);
        tdspan.append("<br>");
    };

    BlastApp.createDownloadLink = function(job, row, archive){
        var a;
        var tdspan = row.find(".blast-history-download");
        a = $("<a href=\"" + archive  + "\">Download Results</a>");
        a.click(function(e){
            e.preventDefault(); 
            BlastApp.downloadArchivedResults(this.getAttribute("href")); }
            );
        tdspan.append(a);
    };

    BlastApp.createRow = function(job){
        var ds = new Date(job.created);
        var de = new Date(job.endTime);
        var icon;
         if(BLAST_CONFIG.runningStates.indexOf(job.status) >= 0) {
            icon = "<span class='glyphicon glyphicon-refresh blast-reload-icon'></span>";
        } else if(BLAST_CONFIG.errorStates.indexOf(job.status) >= 0) {
            icon = "<span class='glyphicon glyphicon-remove' style='color:red'></span>";
        } else if(BLAST_CONFIG.finishedStates.indexOf(job.status) >=0) {
            icon = "<span class='glyphicon glyphicon-ok' style='color:green'></span>";
        }
        var row = $("<tr data-status=" + job.status + " data-id=" + job.id +">" +
            "<td><span class='job-list-icon'>" + icon + "</span> " +
                 "<span class='job-list-status'>" + job.status + "</san></td>" +
            "<td>" + job.appId.split('-')[1] + "</td>" +
            "<td><span style=\"font-weight:bold;\">Created:</span><span> " 
                   + ((ds.getMonth() + 1) < 10 ? "0" + (+ds.getMonth() + 1) : (ds.getMonth() + 1))
                   + "/" + (ds.getDate() < 10 ? "0" + ds.getDate() : ds.getDate()) + "/" 
                   + ds.getFullYear() + " " + 
                   (ds.getHours() < 10 ? "0" + ds.getHours() : ds.getHours()) + ":" 
                   + (ds.getMinutes() < 10 ? "0" + ds.getMinutes() : ds.getMinutes())
                   +  "</span></br>" +
            "<span style=\"font-weight:bold;\">End Time: </span><span>" 
                + ((de.getMonth() + 1) < 10 ? "0" + (+ds.getMonth() + 1) : (ds.getMonth() + 1))
                + "/" + (de.getDate() < 10 ? "0" + ds.getDate() : ds.getDate()) + "/" 
                + de.getFullYear() + " " + 
                (de.getHours() < 10 ? "0" + ds.getHours() : ds.getHours()) + ":" 
                + (de.getMinutes()  < 10 ? "0" + ds.getMinutes() : ds.getMinutes())
                +  "</span></td>" +
            "<td><span class='blast-history-download'></span></td>" +
            "<td><span class='blast-history-actions'></span></td>" +
            "</tr>");
        return row;
    };

    BlastApp.createSpanMetadata = function(job){
        var span = $("<span id=" + job.id + " class=\"blast-hidden blast-tooltip\">" +
        "<ul><li><b>ExecutionSystem: </b></li>" + 
        "</li>" + job.executionSystem + "</li>" +
        "<li><b>Job Id: </b></li>" + 
        "<li>" + job.id + "</li>" +
        "<li><b>App Id: </b></li>" +
        "<li>" + job.appId + "</li>" +
        "<li><b>Name: </b></li>" +
        "<li>" + job.name + "</li>" +
        "</span>");
        return span;
    };

    BlastApp.printJobDetails =  function(job, jhc, jhm){
        var span, archiveUrl, archive, row;
        //Print info
        archiveUrl = job._links.archiveData.href;
        archiveUrl = archiveUrl.substring(archiveUrl.indexOf(BlastApp.username), archiveUrl.length);
        archive = archiveUrl + '/' + job.appId.split('-')[1] + '_out';
        //var archive = archiveUrl + '/' + job.name + '.out';
        row = BlastApp.createRow(job);

        BlastApp.createDownloadLink(job, row, archive);

        BlastApp.createActionLinks(job, row);

        jhc.append(row);

        span = BlastApp.createSpanMetadata(job);

        jhm.append(span);
    };

    BlastApp.appendPager = function(table, pager){
        var row = $(".blaster-pager-row", table);
        var cell;
        var append = false;
        if(row.length <= 0){
            row = $("<tr class=\"blaster-pager-row\"></tr>");
            cell = $("<td colspan=\"5\"></td>");
            row.append(cell);
            append = true;
        }else{
            cell = $("td", row);
        }
        cell.append(pager);
        if(append){
            table.append(row);
        }
        row.show();
    };

    BlastApp.showPage = function(table, results, pageLength, curPage, page){
        var trs = $("tbody tr", table);
        trs.hide();
        var tr;
        for(var i = (page - 1) * pageLength; i < ((page - 1) * pageLength + (pageLength - 1)) && i < (page * pageLength); i++){
            tr = $(trs[i]);
            tr.show();
        }
        curPage = +page;
        $(".blaster-pager", table).remove();
        var ul = BlastApp.printPager(table, results, pageLength, curPage);
        BlastApp.appendPager(table, ul);
    };

    BlastApp.printPager = function(table, results, pageLength, curPage){
        var pages = Math.ceil(results.length / pageLength);
        var ul = $("<ul class=\"blaster-pager\"></ul>");
        
        if(pages < 2){ return ul; }

        ul.append("<li><a href=\"previous\">Previous</a></li>");
        if(curPage == 1){
            ul.append("<li><span>1</span></li>");
        }else{
            ul.append("<li " + (curPage == 1? "class=\"selected\"" : "") + "><a href=\"1\">1</a></li>");
        }
        if(curPage - 2 != 1 && curPage - 2 > 1){
            ul.append("<li><span>...</span></li>");
        }
        if(curPage - 1 != 1 && curPage - 1 > 1){
            ul.append("<li><a href=\"" + (curPage - 1) + "\">" + (curPage - 1) + "</a></li>");
        }
        if(curPage != 1 && curPage != pages) {
            ul.append("<li><span>" + curPage + "</span></li>");
        }
        if(curPage + 1 != pages && curPage + 1 < pages){
            ul.append("<li><a href=\"" + (curPage + 1) + "\">" + (curPage + 1) + "</a></li>");
        }
        if(curPage + 2 != pages && curPage + 2 < pages){
            ul.append("<li><span>...</span></li>");
        }
        if(curPage == pages){
            ul.append("<li><span>" + pages + "</span></li>");
        }else{
            ul.append("<li " + (curPage == pages? "class=\"selected\"" : "") + "><a href=\"" + pages + "\">" + pages + "</a></li>");
        }
        ul.append("<li><a href=\"next\">Next</a></li>");
        $("a", ul).click(function(e){
            e.preventDefault();
            var page = $(this).attr('href');
            if (page == 'previous' && curPage - 1 > 0){
                page = curPage - 1;
            }else if(page == 'previous' && curPage - 1 <= 0){
               page = 1;
            }else if(page == 'next' && curPage + 1 <= pages){
                page = curPage + 1;
            }else if(page == 'next' && curPage + 1 > pages){
                page = pages;
            }
            BlastApp.showPage(table, results, pageLength, curPage, page);
        });
        return ul;
    };

    //get the user's profile info, mostly for the username
    BlastApp.getProfile = function(Agave) {
        Agave.api.profiles.me(null,
            function(results) {
                console.log('Hi, ' + results.obj.result.username + '! Welcome to the Araport Blast App!');
                if(results.obj.status !== 'success') {
                    BlastApp.jobError('Could not find your profile information.');
                }
                BlastApp.username = results.obj.result.username;
                BLAST_CONFIG.archivePath = BLAST_CONFIG.archivePath.replace('%USERNAME',BlastApp.username);
            }, function(err){
                console.log('Could not find profile info.', err);
                BlastApp.jobError('Could not find your profile information.');
            }
        );
    };

    //go fetch the list of available databases from the blast/index.json file on araport-compute-00-storage
    BlastApp.getDatabases = function(Agave) {
        if(BlastApp.databases) { return; }
        appContext.find('.nucleotides').html('<span class="glyphicon glyphicon-refresh blast-reload-icon"></span> Fetching available databases');
        Agave.api.files.download({'systemId':'araport-compute-00-storage','filePath':'blast/index.json'},function(json) {
            BlastApp.databases = JSON.parse(json.data).databases;
            //todo - check for empty databases response
            var nukes = '';
            var peps = '';
            BlastApp.databases.forEach(
                function(el) {
                    var dbEl = '<div class="checkbox"><label><input type="checkbox" class="blast-database" value="'+el.filename+'">'+el.label+'</label></div>';
                    if(el.type === 'nucleotide') {
                        nukes += dbEl;
                    } else {
                        peps += dbEl;
                    }
                }
            );
            appContext.find('.nucleotides').html(nukes);
            appContext.find('.peptides').html(peps);
        }, function() {
            console.log('Failed to find list of available databases.');
            appContext.find('.nucleotides').html('Unable to find available databases!');
            BlastApp.jobError('Unable to find available databases.');
        });
    };

    //Check the status of a job by jobId, react appropriately
    BlastApp.checkJobStatus = function() {
        console.log('BlastApp.status = ' + BlastApp.status);
        var Agave = window.Agave;
        if(BLAST_CONFIG.runningStates.indexOf(BlastApp.status) >= 0) {
            //appContext.find('.job-status').html('Checking...');
            Agave.api.jobs.getStatus({'jobId' : BlastApp.jobId},
                //call success function
                function(json) {
                    //todo check json.obj.status === 'success'
                    BlastApp.status = json.obj.result.status;
                    appContext.find('.job-status .job-status-message').html(BlastApp.status);
                    if(BLAST_CONFIG.runningStates.indexOf(BlastApp.status) >= 0) {
                        console.log('BlastApp.status = ' + BlastApp.status + '. Checking again.');
                        setTimeout(function() { BlastApp.checkJobStatus(); }, 5000);
                    } else if(BLAST_CONFIG.errorStates.indexOf(BlastApp.status) >= 0) {
                        console.log('found ' + BlastApp.status + ' in BLAST_CONFIG.errorStates ' + BLAST_CONFIG.errorStates + ' with indexOf=' + BLAST_CONFIG.errorStates.indexOf(BlastApp.status));
                        BlastApp.updateStatusIcon("error");
                        BlastApp.jobError('Job status is ' + BlastApp.status);
                    } else if(BLAST_CONFIG.finishedStates.indexOf(BlastApp.status) >=0) {
                        BlastApp.updateStatusIcon("success");
                        BlastApp.jobFinished(json.obj.result);
                    } else {
                        console.log('unknown job state! =' + BlastApp.status);
                    }

                },
                //call err function
                function() {
                    BlastApp.jobError('Could not fetch job status.');
                }
            );
        }
    };

    //when job is finished download the result file and stuff it in the browser
    BlastApp.jobFinished = function(result) {
        BlastApp.result = result;
        console.log('getting output file ' + BlastApp.outputFile);
        //now go get the output file and stuff it into the page
        BlastApp.fetchResults();
    };

    BlastApp.fetchResults = function () {
        var Agave = window.Agave;
        Agave.api.files.download({'systemId':BLAST_CONFIG.archiveSystem,'filePath':BlastApp.outputFile},
            function(output) {
                console.log('successful download of results ' + BlastApp.outputFile );
                console.log(output);
                BlastApp.outputData = output.data;
                appContext.find('.blast-job-buttons').removeClass('hidden');
                if(BLAST_CONFIG.parameters.format !== 'HTML') {
                    appContext.find('.job-output').html('<pre>' + BlastApp.outputData + '</pre>');
                } else {
                    appContext.find('.job-output').html(BlastApp.outputData );
                }
            },
            function(err) {
                console.log('Could not download the results file!');
                //todo error handling here
                BlastApp.jobError('Could not get resulting output file. ' + err);
            }
        );
    };

    BlastApp.downloadResults = function() {
        try {
            var isFileSaverSupported = !!new Blob();
            if(!isFileSaverSupported) { BlastApp.jobError('Sorry, your browser does not support this feature. Please upgrade to a modern browser.'); }
        } catch (e) {
            BlastApp.jobError('Sorry, your browser does not support this. Please upgrade to a modern browser.');
            return;
        }
        if(!BlastApp.outputData) {
            BlastApp.jobError('Could not download data.');
        }
        var fileName = BlastApp.blastType + '_' + BlastApp.now + '_out.' + BLAST_CONFIG.parameters.format;
        window.saveAs(new Blob([BlastApp.outputData]), fileName);
    };

    //UI show errors to user
    //!!!TODO improve error handling
    BlastApp.jobError = function(error) {
        console.log('Boo! Job is in an error state!', error);
        appContext.find('.blast-errors').html('<h3>Blast encountered an error</h3><p>' + error + '</p>');
        appContext.find('.blast-errors').removeClass('hidden');
    };

    //Retrieve a list of user's jobs. Will sort by status
    BlastApp.getJobList = function(){
        var Agave = window.Agave;
        //Agave.api.jobs.searchLikeAppId(
        //    {'appId.like':'*blast*'},
        Agave.api.jobs.search(
            null,
            function(result){
                var data = JSON.parse(result.data);
                if(data.status === 'success'){
                    console.log(data);
                    var table = appContext.find('.blast-job-history-content table');
                    var page = +table.attr('data-page');
                    if (isNaN(page)){
                        page = 1;
                    }
                    var jhc = table.find('tbody');
                    jhc.html("");
                    var jhm = appContext.find('.blast-history-meta');
                    var job, ul, i;
                    for(i = 0; i < data.result.length; i++){
                        job = data.result[i];
                        if(job.appId.indexOf("blas") < 0){
                            continue;
                        }
                        BlastApp.printJobDetails(job, jhc, jhm);
                    }
                    var trs = $("tbody tr", table).hide();
                    for(i = 0; i < trs.length - 1 && i < 10; i++){
                        $(trs[i]).show();
                    }
                    ul = BlastApp.printPager(table, data.result, 10, page);
                    BlastApp.appendPager(table, ul);
                }
            },
            function(){
                BlastApp.jobError('Couldn\'t retrieve job list. Please try again later');
            }
        );
        BlastApp._jobListChecker = setInterval(BlastApp.checkJobListStatus, 5000);
    };

    //on form change add class to form element to pick out and add to app description
    appContext.find('form').change(function (event) {
        $(event.target).addClass('form-changed');
    });

    //submit form
    appContext.find('.form-submit').click(function (event) {
        event.preventDefault();//stop form submission
        //clearInterval(BlastApp._jobListChecker);
        appContext.find('.blast-errors').addClass('hidden');
        appContext.find('.blast-submit').addClass('hidden');
        appContext.find('.job-monitor').removeClass('hidden');
        appContext.find('.job-status .job-status-message').html('Uploading data.');
        var Agave = window.Agave;

        //grab changed advanced options
        var changedAdvOptions = appContext.find('.advanced-blast-options').find('.form-changed');
        for(var i =0; i < changedAdvOptions.length; i++) {
          console.log(changedAdvOptions[i].id + ' = ' + changedAdvOptions[i].value);
          BLAST_CONFIG.parameters[changedAdvOptions[i].id] = changedAdvOptions[i].value;
        }

        //get blast type and add to app instance
        BlastApp.blastType = appContext.find('#appId').val();
        BLAST_CONFIG.appId = blastTypes[BlastApp.blastType];
        BlastApp.outputFile = BlastApp.username + '/archive/jobs/blast-'+ BlastApp.now + '/' + BlastApp.blastType + '_out';

        //get databases and add to app instance
        var dbs = '';
        appContext.find('.blast-database:checked').each(function(){
            dbs +=$(this).val() + ' ';
        });
        if(dbs.length > 0) {
            BLAST_CONFIG.parameters.database = dbs;
        } else {
            //todo error saying you have to select at least one DB
            $('.databases-panel').addClass('text-danger');
            appContext.find('.blast-submit').removeClass('hidden');
            appContext.find('.job-monitor').addClass('hidden');
            BlastApp.jobError('You must select at least one database.');
            $(window).scrollTop(0, 'slow');
            return false;
        }


        //upload file from contents of input form text area
        var blob = new Blob([$('#edit-sequence-input').val()], {type: 'text/plain'});
        var formData = new FormData();
        var inputFileName = BlastApp.now+'.txt';
        console.log('uploading ' + inputFileName);
        formData.append('fileToUpload',blob,inputFileName);

        Agave.api.files.importData(
            {systemId: BLAST_CONFIG.archiveSystem , filePath: BlastApp.username, fileToUpload: blob, fileName: inputFileName},
            {requestContentType: 'multipart/form-data'},
            function(resp) {
                //successful upload, but need to check for agave errors
                if(resp.obj.status !== 'success') {
                    BlastApp.jobError('Could not upload file. ' + resp.obj.message);
                }
                //actual successful upload.
                //submit the job
                appContext.find('.job-status .job-status-message').html('Submitting job.');
                BLAST_CONFIG.inputs.query = 'agave://araport-storage-00/'+BlastApp.username + '/' + inputFileName;
                console.log('submitting job:', BLAST_CONFIG);
                //submit the job
                Agave.api.jobs.submit({'body': JSON.stringify(BLAST_CONFIG)},
                    function(jobResponse) { //success
                        console.log('Job Submitted.');
                        appContext.find('.blast-submit').addClass('hidden');
                        appContext.find('.job-monitor').removeClass('hidden');
                        if(jobResponse.obj.status === 'success') {

                            //job successfully submitted, find out the status
                            BlastApp.jobId = jobResponse.obj.result.id;
                            BlastApp.status = jobResponse.obj.result.status;
                            //is the job done? (unlikely)
                            if(BlastApp.status === 'FINISHED') {
                                console.log('job immediately finished');
                                BlastApp.updateStatusIcon("success");
                                BlastApp.jobFinished(jobResponse.obj.result);
                            } else { //more likely we need to poll the status
                                BlastApp.status = jobResponse.obj.result.status;
                                appContext.find('.job-status .job-status-message').html('Job Status is ' + BlastApp.status);
                                if((BlastApp.status === 'PENDING')) {
                                    BlastApp.updateStatusIcon("pending");
                                    setTimeout(function() { BlastApp.checkJobStatus(); }, 5000);
                                }
                            }
                            setTimeout(function() {BlastApp.getJobList(); }, 6500);
                        } else {
                            console.log('Job did not successfully submit.', jobResponse.data.message);
                            //todo better error handling here
                            BlastApp.jobError('Job did not successfully submit. ' + jobResponse.data.message);
                        }
                    } ,
                    function(err) { //fail
                        //agave.api failed
                        console.log('Job did not successfully submit.', err);
                        BlastApp.jobError('Job did not successfully submit.', err);
                    }
                );

            }, function() {
                BlastApp.jobError('Could not upload file.');
                return false;
            }
        );

    }); //end click submit
    //event handler for download button click
    appContext.find('.blast-download-button').click( function() {
        BlastApp.downloadResults();
    });

  /* Initialize Agave */
  window.addEventListener('Agave::ready', function() {
    //var Agave, help, helpItem, helpDetail, methods, methodDetail;
    var Agave;
    Agave = window.Agave;
    BlastApp.getProfile(Agave); //get the user info like username
    BlastApp.getDatabases(Agave); //load the Databases
    BlastApp.getJobList();
  });

  /* reload button */
  //todo - this needs to not just reload the page to play nice in multi-app environment
  appContext.find('.blast-reload-button').click(function(){
    location.reload();
  });

  /* function to remove/add collapsed class on panel title dropdown. In production the toggle function doesn't do this */
  appContext.find("[data-toggle=collapse]").click(function(){
      var el = $(this);
      if(el.hasClass("collapsed")){
          el.removeClass("collapsed");
      }else{
          el.addClass("collapsed");
      }
  });

})(window, jQuery);

(function(window, $, undefined) {
  'use strict';
  
  var appContext = $('[data-app-name="araport-blast-app"]');
  console.log('Hello, I am ' + appContext);

  //the different blast types and their app IDs
  var blastTypes = {
    'blastn' : 'ncbi-blastn-2.2.29u5',
    'blastp':'ncbi-blastp-2.2.29u3',
    'blastx':'ncbi-blastx-2.2.29u3',
    'tblastn':'ncbi-tblastn-2.2.29u3',
    'tblastx':'ncbi-tblastx-2.2.29u3',
  };
  
  //app template
  var BLAST_CONFIG = {
        'name': 'blast-test-%DATESTAMP',
        'appId': 'ncbi-blastn-2.2.29u3',
        'queue': 'normal',
        'nodeCount': 1,
        'maxMemoryPerNode': 1,
        'processorsPerNode': 1,
        'requestedTime': '00:30:00',
        'archive': true,
        'archivePath': '%USERNAME/archive/jobs/blastn-test-%DATESTAMP',
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

    var AgaveFilesURL = 'https://api.araport.org/files/v2/media/system/';
    var BlastApp = {}; //info dumping ground

    //using date and time as an identifier. probably should switch this to a uuid or something   
    if (!Date.now) {
        Date.now = function() { return new Date().getTime(); };
    }
    var now = Date.now();
    BlastApp.now = now;
    BLAST_CONFIG.archivePath = BLAST_CONFIG.archivePath.replace('%DATESTAMP',now);
    BLAST_CONFIG.name = BLAST_CONFIG.name.replace('%DATESTAMP',now);

    //get the user's profile info, mostly for the username
    BlastApp.getProfile = function(Agave) {
        Agave.api.profiles.me(null,
            function(results) { 
                console.log(results);
                console.log('profile found username=' + results.obj.result.username); 
                BlastApp.username = results.obj.result.username;
                BLAST_CONFIG.archivePath = BLAST_CONFIG.archivePath.replace('%USERNAME',BlastApp.username);
                BlastApp.uploadPath = AgaveFilesURL + 'araport-storage-00/' + BlastApp.username + '/';
                
            }, function(){
                console.log('failure?');
                BlastApp.jobError('Could not find your profile information.');
            }
        );
    }; 
 
    //go fetch the list of available databases from the blast/index.json file on araport-compute-00-storage
    BlastApp.getDatabases = function(Agave) {
        if(BlastApp.databases) { return; }
        $('.nucleotides').html('Fetching available databases');     
        //'araport-compute-00-storage/blast/index.json'
        Agave.api.files.download({'systemId':'araport-compute-00-storage','filePath':'blast/index.json'},function(json) {
            BlastApp.databases = JSON.parse(json.data).databases;
            console.log( BlastApp.databases );
            //todo - check for empty databases response
            var nukes = '';
            var peps  = '';
            BlastApp.databases.forEach(
                /* jshint ignore:start */ //whines about index and array not being used
                function(el, index, array) {
                    var dbEl = '<div class="checkbox"><label><input type="checkbox" class="blast-database" value="'+el.filename+'">'+el.label+'</label></div>';
                    if(el.type === 'nucleotide') {
                        nukes += dbEl;
                    } else {
                        peps += dbEl;
                    }
                }
                /* jshint ignore:end */
            );
            $('.nucleotides').html(nukes);
            $('.peptides').html(peps);
        }, function() {
            console.log('Failed to find list of available databases.');
            $('.nucleotides').html('Unable to find available databases!');
        });
    }; 
     
    //Check the status of a job by jobId, react appropriately 
    BlastApp.checkJobStatus = function() {
        console.log('BlastApp.status = ' + BlastApp.status);
        console.log('BlastApp.jobId='+ BlastApp.jobId);
        var Agave = window.Agave;
        if(BLAST_CONFIG.runningStates.indexOf(BlastApp.status) >= 0) {
            $('.job-status').html('Checking...');
            Agave.api.jobs.getStatus({'jobId':BlastApp.jobId},
                //call success function
                function(json) {
                    console.log(json.obj);
                    //todo check json.obj.status === 'success'
                    BlastApp.status = json.obj.result.status;
                    $('.job-status').html(BlastApp.status);
                    if(BLAST_CONFIG.runningStates.indexOf(BlastApp.status) >= 0) {
                        console.log('ok, here we go again because BlastApp.status =' + BlastApp.status);
                        setTimeout(function() { BlastApp.checkJobStatus(); }, 5000);
                    } else if(BLAST_CONFIG.errorStates.indexOf(BlastApp.status) >= 0) {
                        console.log('found ' + BlastApp.status + ' in BLAST_CONFIG.errorStates ' + BLAST_CONFIG.errorStates + ' with indexOf=' + BLAST_CONFIG.errorStates.indexOf(BlastApp.status));
                        BlastApp.jobError();
                    } else if(BLAST_CONFIG.finishedStates.indexOf(BlastApp.status) >=0) {
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
        Agave.api.files.download({'systemId':'araport-storage-00','filePath':BlastApp.outputFile},
            function(output) {
                console.log('hi! download of results ' + BlastApp.outputFile + ' totally worked');
                console.log(output);
                BlastApp.outputData = output.data;
                $('.job-buttons').removeClass('hidden');
                if(BLAST_CONFIG.parameters.format !== 'HTML') {
                    $('.job-output').html('<pre>' + BlastApp.outputData + '</pre>');
                } else {
                    $('.job-output').html(BlastApp.outputData );
                }
            },
            function(err) {
                console.log('oh no, could not download the results file!');
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
        if(! BlastApp.outputData) {
            BlastApp.jobError('Could not download data.');
        }
        var fileName = BlastApp.blastType + '_' + BlastApp.now + '_out.' + BLAST_CONFIG.parameters.format;
        window.saveAs(new Blob([BlastApp.outputData]), fileName);
    };

    //UI show errors to user
    //!!!TODO better. Add obj as well as string?
    BlastApp.jobError = function(error) {
        console.log('Boo! Job is in an error state!');
        $('.blast-errors').html('<h3>Blast encountered an error</h3><p>' + error + '</p>');
        $('.blast-errors').removeClass('hidden');
    };    
        
    //on form change add class to form element to pick out and add to app description
    $('form').change(function (event) {
        $(event.target).addClass('form-changed');
    });    

    //submit form
    $('.form-submit').click(function (event) {
        event.preventDefault();//stop form submission
        $('.blast-errors').addClass('hidden');
        $('.blast-submit').addClass('hidden');
        $('.job-monitor').removeClass('hidden');
        $('.job-status').html('Uploading data.');
        var Agave = window.Agave;
        
        //grab changed advanced options
        var changedAdvOptions = $('.advanced-blast-options').find('.form-changed');
        for(var i =0; i < changedAdvOptions.length; i++) {
          console.log(changedAdvOptions[i].id + ' = ' + changedAdvOptions[i].value);
          BLAST_CONFIG.parameters[changedAdvOptions[i].id] = changedAdvOptions[i].value;
        }
        
        //get blast type and add to app instance
        BlastApp.blastType = $('#appId').val();
        BLAST_CONFIG.appId = blastTypes[BlastApp.blastType];
        BlastApp.outputFile = BlastApp.username + '/archive/jobs/blastn-test-'+ BlastApp.now + '/' + BlastApp.blastType + '_out';
        
        //get databases and add to app instance
        var dbs = '';
        $('.blast-database:checked').each(function(){
            dbs +=$(this).val() + ' ';
        });
        if(dbs.length > 0) {
            BLAST_CONFIG.parameters.database = dbs;
        } else {
            //todo error saying you have to select at least one DB
        }
                      
        console.log(BLAST_CONFIG);       
        
        //upload file from contents of input form text area
        var blob = new Blob([$('#edit-sequence-input').val()], {type: 'text/plain'});
        var formData = new FormData();
        var inputFileName = BlastApp.now+'.txt';
        console.log('uploading ' + inputFileName);
        formData.append('fileToUpload',blob,inputFileName);
        
        var xhr = new XMLHttpRequest();
        xhr.open('POST', BlastApp.uploadPath, true);
        xhr.setRequestHeader('Authorization', 'Bearer ' + Agave.token.accessToken);
        xhr.timeout = 0;        
        xhr.onload = function () {
            
            var parsedJSON = JSON.parse(xhr.response);
            parsedJSON = parsedJSON.result;
            
            if (xhr.status === 200 || 202) {     //if the upload was good, then submit job
                $('.job-status').html('Submitting job.');
                BLAST_CONFIG.inputs.query = 'agave://araport-storage-00/'+BlastApp.username + '/' + inputFileName;
                console.log('submitting:');
                console.log(BLAST_CONFIG);
                //submit the job               
                Agave.api.jobs.submit({'body': JSON.stringify(BLAST_CONFIG)}, 
                    function(jobResponse) { //success
                        console.log('JOB SUBMISSION DONE!');
                        console.log(jobResponse.obj);
                        $('.blast-submit').addClass('hidden');
                        $('.job-monitor').removeClass('hidden');
                        if(jobResponse.obj.status === 'success') {
                    
                            //job successfully submitted, find out the status
                            BlastApp.jobId = jobResponse.obj.result.id;
                            BlastApp.status = jobResponse.obj.result.status;
                            //is the job done? (unlikely)
                            if(BlastApp.status === 'FINISHED') {
                                console.log('job immediately finished, yay!');
                                BlastApp.jobFinished(jobResponse.obj.result);
                            } else { //more likely we need to poll the status   
                                BlastApp.status = jobResponse.obj.result.status;
                                $('.job-status').html('Job Status is ' + BlastApp.status);
                                if((BlastApp.status === 'PENDING')) {
                                    setTimeout(function() { BlastApp.checkJobStatus(); }, 5000);
                                }
                            }
                        } else {
                            console.log('Job did not successfully submit.');
                            console.log(jobResponse.data.message);
                            //todo better error handling here
                             BlastApp.jobError('Job did not successfully submit. ' + jobResponse.data.message);
                        }
                    } , 
                    function(err) { //fail
                        //agave.api failed
                        console.log('Job did not successfully submit.');
                        console.log(err);
                        BlastApp.jobError('Job did not successfully submit. ' + err);
                    }
                );
          
            } else {
                console.log('Upload did not work.');
                console.log(parsedJSON);
                BlastApp.jobError('Input failed to upload.');
            }
        };
        xhr.onerror = function () {
            //todo
            console.log('booo! upload failed!' + xhr.status);
            console.log(xhr);
            BlastApp.jobError('Input failed to upload: ' + xhr.status);
        };
       
        xhr.send(formData); //actually make the file upload call
    }); //end click submit

    //event handler for download button click
    $('.blast-download-button').click( function() {
        BlastApp.downloadResults();
    });
    
  /* Initialize Agave */
  window.addEventListener('Agave::ready', function() {
    //var Agave, help, helpItem, helpDetail, methods, methodDetail;
    var Agave;
    Agave = window.Agave;
    BlastApp.getProfile(Agave); //get the user info like username
    BlastApp.getDatabases(Agave); //load the Databases
  });
  
  /* reload button */
  $('.blast-reload-button').click(function(){
    location.reload();
  });

})(window, jQuery);

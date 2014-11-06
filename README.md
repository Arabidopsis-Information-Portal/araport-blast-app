# Araport Blast+

An [AIP](http://www.araport.org) Science App created using [Yeoman](http://yeoman.io)
and the [AIP science app generator](https://www.npmjs.org/package/generator-aip-science-app).

## Runs {t}blast{p|x|n} on Araport's Cyberinfrastructure

Runs any of the above blast types against a set of databases. 


## Agave APIs Used

<dl>
	<dt>Agave.api.profiles.me(null, callbacks) </dt><dd> Gets user's username for storing and fetching files.</dd>
	<dt>Agave.api.files.download({'systemId':'araport-compute-00-storage','filePath':'blast/index.json'}, callbacks) </dt><dd> Downloads the list of available databases from a JSON file on "araport-compute-00-storage" to populate the checkboxes. </dd>
	<dt>Agave.api.files.importData(
            {systemId: BLAST_CONFIG.archiveSystem , filePath: BlastApp.username, fileToUpload: blob, fileName: inputFileName},
            {requestContentType: 'multipart/form-data'}, callbacks) </dt><dd> Takes your input sequence and uploads it to the archive system as a file.</dd>
	<dt>Agave.api.jobs.submit({'body': JSON.stringify(BLAST_CONFIG)},callbacks) </dt><dd> Submit the job.</dd>
	<dt>Agave.api.jobs.getStatus({'jobId':BlastApp.jobId}, callbacks)</dt><dd>Checks the job status.</dd>		<dt>Agave.api.files.download({'systemId':BLAST_CONFIG.archiveSystem,'filePath':BlastApp.outputFile},callback) </dt><dd> Download Job Results.</dd>
</dl>

## Running the App

You can run and interactively develop this app using the built-in test runner. Simply
execute this command from within the base directory:

```bash
$ grunt
```

This will run this application on a local server at
[http://localhost:9000](http://localhost:9000). It will also watch the
app code for changes and automatically reload the browser when it detects
changes.

You can also run the test runner app in "production" mode with the command:

```bash
$ grunt serve:dist
```

This will start the same server, but without source code monitoring (live reload)
and will also permit connections from outside, for example if you wanted to host
the app yourself on a publicly accessible server.

** More details coming soon! **

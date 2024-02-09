function appendElements(parent, ...children){
    for (let child of children){
        parent.appendChild(child);
    }
}

function setupHTML(name){
    let parent = document.getElementsByTagName('main')[0]

    // Fieldset stuff
    let fieldset = document.createElement('fieldset');
    let legend = document.createElement('legend')
    let h2 = document.createElement('h2');

    // Header stuff
    let header = document.createElement('div');
    let startInput = document.createElement('input')
    let endInput = document.createElement('input')
    let updateInput = document.createElement('input')
    
    // Body stuff
    let body = document.createElement('div')
    let canvas = document.createElement('canvas')

    // Assign classes
    header.classList.add('header')
    body.classList.add('body')
    
    // Input types
    startInput.type = 'datetime-local'
    endInput.type = 'datetime-local'
    updateInput.type = 'button'
    
    // Values
    h2.innerHTML = name;
    updateInput.value = 'Refresh'

    // Append stuff
    appendElements(parent, fieldset)

    appendElements(fieldset, legend)
    appendElements(legend, h2);

    appendElements(fieldset, header, body)
    appendElements(header, startInput, updateInput, endInput)

    appendElements(body, canvas)

    // Return elements that have user interaction
    return {canvas, startInput, endInput, updateInput};
}

function datetimeValueToDate(value){
    // Split the date and time
    let bigParts = value.split('T');

    // Get date parts
    let [year, month, day] = bigParts[0].split('-')

    // Get time parts
    let [hour, min, sec] = bigParts[1].split(':')

    // Build date, seconds may not be there
    return new Date(year, month, day, hour, min, sec ? sec : null);
}

function dateToDatetimeValue(date){
    // Prepend 0 to make number 2 digits
    let pad = n => n.toString().length < 2 ? `0${n}` : n;

    // Get individual date parts
    let year = date.getFullYear()
    let month = pad(date.getMonth())
    let day = pad(date.getDate())
    let hour = pad(date.getHours())
    let minute = pad(date.getMinutes())
    let second = pad(date.getSeconds())

    // Format string
    return `${year}-${month}-${day}T${hour}:${minute}:${second}`
}

function updateGraph(id, graph, startDate, endDate){
    return new Promise((resolve, reject) => {
        // Get UTC timestamps
        let start = startDate.getTime();
        let end = endDate.getTime();

        // Request data from API
        fetch(`/api/plug_results/${id}?start=${start}&end=${end}`)
        // Parse JSON
        .then(res => res.json())
        .then(res => {
            // Update graph
            graph.update(res.data.results, start, end);
            resolve();
        })
        .catch(err => {
            reject(err);
        })
    })
}

function setupGraph(id, canvas, startInput, endInput, updateInput){
    let graph = new Graph(canvas);

    // When the refresh button is clicked
    updateInput.onclick = () => {
        // Disable button
        updateInput.disabled = true;

        // Get dates from inputs
        let startDate = datetimeValueToDate(startInput.value)
        let endDate = datetimeValueToDate(endInput.value);

        // Update graph
        updateGraph(id, graph, startDate, endDate)
        .catch(err => {
            alert('Failed to update!')
            console.error(err);
        })
        .finally(() => {
            // Reenable button
            updateInput.disabled = false;
        })
    }

    // Initial dates for when page is first loaded
    let initialStartDate = new Date();
    let initialEndDate = new Date(initialStartDate);

    // Set start to beginning of current hour
    initialStartDate.setMinutes(0, 0, 0);
    // Set end to end of current hour
    initialEndDate.setMinutes(59, 59, 59);

    // Write dates to inputs
    startInput.value = dateToDatetimeValue(initialStartDate)
    endInput.value = dateToDatetimeValue(initialEndDate)

    // Update graph
    updateInput.click()
}

function setup(id, name){
    // Setup HTML elements, and get the ones with user interaction
    let {canvas, startInput, endInput, updateInput} = setupHTML(name)

    // Setup graph with user interation
    setupGraph(id, canvas, startInput, endInput, updateInput)
}

document.body.onload = () => {
    // Fetch plugs
    fetch('/api/plug').then(res => res.json()).then(res => {
        // Setup each plug
        for (let {plug_id, plug_name} of res.data.plugs){
            setup(plug_id, plug_name);
        }
    }).catch(err => {
        console.error(err);
    })
}
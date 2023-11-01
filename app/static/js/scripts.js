/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */
const SearchTimebufferHours = 2;
let Segments = [];
const tableCells = new Array(12).fill("false");

function StartStats() {
	const Update = () => {
		$.ajax({
			type: 'GET',
			url: '/systeminfo',
			dataType: 'json',
			success: function (data) {
				$('#CPU').html(data.CPU + '%');
				$('#RAM').html(data.MEM.usedMemPercentage + '%');
				$('#DISK').html(data.DISK.usedPercentage + '%');
			}
		});
	};
	Update();
	setInterval(() => {
		Update();
	}, 5000);
}

function StartTimeline(ID, Name) {
	const contents = $('#scrub').html();
	const copy = $('<div style="padding:5px" id="' + ID + '"></div>');
	copy.append(contents);
	copy.dialog({
		width: 855,
		height: 630,
		modal: true,
		title: Name + ' Timeline Viewer',
		close: function () {
			const VideoElement = copy.find('video');
			const VE5 = $(VideoElement)[0];
			VE5.pause();
			VE5.remove();
		}
	});

	const TimelineDiv = copy.find('#timeline');
	const TL = $(TimelineDiv)[0];

	const Groups = new vis.DataSet([
		{ content: 'Video', id: 'Video', value: 1 },
		{ content: 'Events', id: 'Events', value: 2 }
	]);

	const Items = new vis.DataSet([
		{ id: 1, content: 'Display Fix', start: '2000-01-01' }
	]);

	const Options = {
		start: dayjs().subtract(1, 'hour').toDate(),
		end: dayjs().add(15, 'minutes').toDate(),
		groupOrder: function (a, b) {
			return a.value - b.value;
		},
		height: 150,
		editable: false,
		groupEditable: false,
		stack: false,
		rollingMode: {
			follow: false,
			offset: 0.5
		}
	};

	// create a Timeline
	const timeline = new vis.Timeline(TL, Items, Groups, Options);
	Items.remove(1);

	let CommitTimeout;
	let isMoving = false;
	timeline.on('rangechange', (event) => {
		clearTimeout(CommitTimeout);
		isMoving = true;
	});
	timeline.on('rangechanged', (event) => {
		CommitTimeout = setTimeout(() => {
			const Start = dayjs(event.start)
				.subtract(SearchTimebufferHours, 'hour')
				.unix();
			const End = dayjs(event.end).add(SearchTimebufferHours, 'hour').unix();
			GetSegmentsAndEvents(timeline, Items, Start, End, ID);
			isMoving = false;
		}, 500);
	});
	timeline.on('click', (event) => {
		if (!isMoving) {
			timeline.setCurrentTime(event.time);
			LoadAndPosition(timeline, event.time, copy, ID);
		}
		isMoving = false;
	});
}

let VideoFile;
function LoadAndPosition(Timeline, Date, Copy, ID) {
	const VideoElement = Copy.find('video');
	const VE5 = $(VideoElement)[0];
	const Time = dayjs(Date).unix();
	const MatchedSegments = Segments.filter(
		(S) => S.Start <= Time && S.End >= Time
	)[0];
	const VideoStart = MatchedSegments.Start;

	const URL = '/segments/' + ID + '/' + MatchedSegments.FileName;

	let StartTime = Time - VideoStart;
	if (StartTime < 0) {
		StartTime = 0;
	}

	if (VideoFile === undefined || VideoFile !== URL) {
		if (!VE5.paused) {
			VE5.pause();
		}

		VideoElement.off('timeupdate');
		VideoElement.on('timeupdate', (event) => {
			const Date = dayjs
				.unix(MatchedSegments.Start)
				.add(VE5.currentTime, 'second')
				.toDate();
			Timeline.setCurrentTime(Date);
		});

		VideoElement.one('canplay', () => {
			VE5.play().then((R) => {
				VE5.currentTime = StartTime;
			});
		});
		VE5.src = '/segments/' + ID + '/' + MatchedSegments.FileName;
		VideoFile = URL;
	} else {
		VE5.currentTime = StartTime;
		if (VE5.paused) {
			VE5.play();
		}
	}
}

function EventSort(a, b) {
	return a.Start - b.Start;
}

function GetSegmentsAndEvents(Timeline, DataSet, Start, End, ID) {
	$.getJSON('/geteventdata/' + ID + '/' + Start + '/' + End, function (data) {
		data.segments.sort(EventSort);
		Segments = data.segments;

		DataSet.clear();
		for (let i = 0; i < data.segments.length; i++) {
			const Seg = data.segments[i];
			const Start = dayjs.unix(Seg.Start);
			const End = dayjs.unix(Seg.End);

			DataSet.add({
				start: Start.toDate(),
				end: End.toDate(),
				type: 'background',
				group: 'Video',
				content: Start.format('YYYY-MM-DD HH:mm:ss'),
				style:
					'background-color: rgba(0,0,0,0.5);color: white;border-radius: 6px;',
				fileName: Seg.FileName,
				cameraId: Seg.CameraID,
				segmentId: Seg.SegmentID
			});
		}

		for (let i = 0; i < data.events.length; i++) {
			const Event = data.events[i];
			const Start = dayjs.unix(Event.Date);

			DataSet.add({
				start: Start.toDate(),
				group: 'Events',
				content: Event.Name,
				style: 'background-color: orangered;color: white;border-radius: 6px;'
			});
		}

		Timeline.redraw();
	});
}

// --------------------------------------------------
function findAvailableCell(ID) {
	// Temukan sel pertama yang tersedia (false)
	for (let i = 0; i < tableCells.length; i++) {
	  if (tableCells[i] == "false") {
		tableCells[i] = ID; // Tandai sel sebagai diisi
		return i + 1; // Kembalikan nomor sel yang diisi (dalam hal ini, nomor sel dimulai dari 1)
	  }
	}
	return null; // Jika semua sel sudah terisi, kembalikan null
}


function closeLive(ID, cellNumber) {
    // Hentikan video
    const VE5 = document.getElementById(ID);
    VE5.pause();
    VE5.remove();

	const liveName0Element = document.getElementById("liveName" + cellNumber);
	liveName0Element.textContent="";

    // Setel kembali sel tabel yang sesuai sebagai tersedia (false)
    tableCells[cellNumber - 1] = "false";
}

function StartLive(ID, Name, Codec) {
    let buffer;
    let socket;
	if(tableCells.includes(ID)){
		alert('Kamera sudah live!')
	}else{
		if (!MediaSource.isTypeSupported(Codec)) {
			alert('Unsupported mime type');
			return;
		}

		const mediaSource = new MediaSource();
		const DataURL = URL.createObjectURL(mediaSource);
		const VE5 = document.createElement('video');
		VE5.id = ID; // Setel ID video sesuai dengan ID yang diberikan

		VE5.width = 360;
		VE5.height = 240;

		VE5.src = DataURL;

		mediaSource.addEventListener('sourceopen', function (e) {
			buffer = mediaSource.addSourceBuffer(Codec);
			buffer.mode = 'sequence';
			buffer.addEventListener('updateend', function (e) {
				if (
					mediaSource.duration !== Number.POSITIVE_INFINITY &&
					VE5.currentTime === 0 &&
					mediaSource.duration > 0
				) {
					VE5.currentTime = mediaSource.duration - 1;
					mediaSource.duration = Number.POSITIVE_INFINITY;
				}

				VE5.play();
			});
			
			socket = io('/', { path: '/streams/' + ID });
			socket.on('segment', function (data) {
				data = new Uint8Array(data);
				buffer.appendBuffer(data);
			});
		});

		const cellNumber = findAvailableCell(ID);
		if (cellNumber !== null) {
			const videoCell = document.getElementById('videoCell' + cellNumber);
			videoCell.appendChild(VE5);

			const liveName0Element = document.getElementById("liveName" + cellNumber);
			liveName0Element.textContent=Name;
			// Tambahkan tombol "Close" ke dalam sel tabel
			const closeButton = document.createElement('button');
			const fullButton = document.createElement('button');

			fullButton.innerText = 'Full Screen';
			fullButton.classList.add('customButtonFullScreen');
			fullButton.addEventListener('click', function() {
				goFullscreen(VE5);
			});
			videoCell.append(fullButton);

			closeButton.innerText = 'Close';
			closeButton.classList.add('customButton');
			closeButton.addEventListener('click', function () {
				// Tutup video saat tombol "Close" ditekan
				closeLive(ID, cellNumber);

				fullButton.remove();
				// Hapus tombol "Close" dari sel tabel
				closeButton.remove();
			});
			videoCell.appendChild(closeButton);

			ID.disabled = true;
		} else {
			alert('Semua sel tabel sudah terisi.');
		}
	}
}


function goFullscreen(element) {
	if (element.mozRequestFullScreen) {
		element.mozRequestFullScreen();
	} else if (element.webkitRequestFullScreen) {
		element.webkitRequestFullScreen();
	}
}

function Login() {
	const Data = {
		password: $('#Password').val(),
		username: $('#Username').val()
	};
	$.ajax({
		type: 'POST',
		url: '/login',
		data: JSON.stringify(Data),
		contentType: 'application/json; charset=utf-8',
		success: function () {
			document.location = '/dashboard';
		},
		error: function () {
			alert('Could not login. This may be due to incorrect login details');
		}
	});
}
